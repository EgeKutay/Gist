package com.gist.crypto;

import com.gist.config.GistProperties;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * AES-256-GCM for the columns that hold what people actually said.
 *
 * <p>Stored layout is {@code [12-byte IV][ciphertext][16-byte tag]}. The IV is
 * random per value and never derived from the row: reusing an IV under GCM
 * leaks the plaintext relationship between the two values encrypted with it.
 */
@Component
public class FieldEncryptor {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int KEY_BYTES = 32;

    /**
     * JPA builds AttributeConverters itself, outside the Spring context, so
     * they reach the encryptor through this rather than by injection.
     */
    private static volatile FieldEncryptor shared;

    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public FieldEncryptor(GistProperties props) {
        this.key = readKey(props.getEncryption().getKey());
    }

    @PostConstruct
    void publishShared() {
        shared = this;
    }

    static FieldEncryptor shared() {
        FieldEncryptor instance = shared;
        if (instance == null) {
            throw new IllegalStateException(
                    "FieldEncryptor was used before the application context finished starting.");
        }
        return instance;
    }

    private static SecretKey readKey(String base64) {
        if (base64 == null || base64.isBlank()) {
            throw new IllegalStateException(
                    "GIST_ENCRYPTION_KEY is not set. Generate one with:\n"
                            + "  $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider\n"
                            + "  $b = New-Object byte[] 32; $rng.GetBytes($b)\n"
                            + "  [Convert]::ToBase64String($b)");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("GIST_ENCRYPTION_KEY is not valid base64.", e);
        }
        if (bytes.length != KEY_BYTES) {
            throw new IllegalStateException(
                    "GIST_ENCRYPTION_KEY must decode to " + KEY_BYTES + " bytes, got " + bytes.length + ".");
        }
        // A zeroed key means someone's key generator failed quietly -- PowerShell
        // 5.1 has no RandomNumberGenerator::Fill, and it produces exactly this.
        boolean allZero = true;
        for (byte b : bytes) {
            if (b != 0) {
                allZero = false;
                break;
            }
        }
        if (allZero) {
            throw new IllegalStateException(
                    "GIST_ENCRYPTION_KEY is all zero bytes -- your key generator failed silently. "
                            + "Generate a real one before storing anything.");
        }
        return new SecretKeySpec(bytes, "AES");
    }

    public byte[] encrypt(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] sealed = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            byte[] out = new byte[iv.length + sealed.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(sealed, 0, out, iv.length, sealed.length);
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("Could not encrypt a field for storage.", e);
        }
    }

    public String decrypt(byte[] stored) {
        if (stored == null) {
            return null;
        }
        if (stored.length <= IV_BYTES) {
            throw new IllegalStateException("Stored value is too short to be AES-GCM output.");
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key,
                    new GCMParameterSpec(TAG_BITS, stored, 0, IV_BYTES));
            byte[] plain = cipher.doFinal(stored, IV_BYTES, stored.length - IV_BYTES);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            // GCM authentication failing almost always means the wrong key.
            throw new IllegalStateException(
                    "Could not decrypt stored data. Is GIST_ENCRYPTION_KEY the same key it was written with?", e);
        }
    }
}
