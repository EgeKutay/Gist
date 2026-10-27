package com.gist.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Transparently encrypts a text column. Applied with {@code @Convert}. */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, byte[]> {

    @Override
    public byte[] convertToDatabaseColumn(String attribute) {
        return FieldEncryptor.shared().encrypt(attribute);
    }

    @Override
    public String convertToEntityAttribute(byte[] dbData) {
        return FieldEncryptor.shared().decrypt(dbData);
    }
}
