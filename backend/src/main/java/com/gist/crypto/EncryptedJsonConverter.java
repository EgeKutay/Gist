package com.gist.crypto;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Map;

/**
 * Encrypts the summary maps. Encrypting means the column can no longer be
 * jsonb, which is the accepted cost: nothing queries inside a summary -- the
 * whole object is rendered by the client.
 */
@Converter
public class EncryptedJsonConverter implements AttributeConverter<Map<String, Object>, byte[]> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public byte[] convertToDatabaseColumn(Map<String, Object> attribute) {
        if (attribute == null) {
            return null;
        }
        try {
            return FieldEncryptor.shared().encrypt(MAPPER.writeValueAsString(attribute));
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialize a summary for storage.", e);
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> convertToEntityAttribute(byte[] dbData) {
        String json = FieldEncryptor.shared().decrypt(dbData);
        if (json == null) {
            return null;
        }
        try {
            return MAPPER.readValue(json, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("Stored summary could not be read back as JSON.", e);
        }
    }
}
