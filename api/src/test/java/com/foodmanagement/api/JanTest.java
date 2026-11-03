package com.foodmanagement.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.foodmanagement.api.stock.Jan;
import org.junit.jupiter.api.Test;

class JanTest {

    @Test
    void checksTheCheckDigit() {
        assertThat(Jan.isValid("4901234567894")).isTrue();
        assertThat(Jan.isValid("4901234567890")).isFalse();
        assertThat(Jan.isValid("2000000000015")).isTrue();
        assertThat(Jan.isValid("49123456")).isTrue();
        assertThat(Jan.isValid("49123457")).isFalse();
        assertThat(Jan.isValid("12345")).isFalse();
        assertThat(Jan.isValid(null)).isFalse();
    }
}
