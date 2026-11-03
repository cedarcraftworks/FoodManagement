package com.foodmanagement.api;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.testcontainers.containers.PostgreSQLContainer;

/** テスト用の設定：本物の PostgreSQL 16 を Docker で起動し、「今日」を 2026-11-01（日本時間）に固定する。 */
@TestConfiguration(proxyBeanMethods = false)
class TestConfig {

    static final ZoneId TOKYO = ZoneId.of("Asia/Tokyo");

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgres() {
        return new PostgreSQLContainer<>("postgres:16");
    }

    @Bean
    @Primary
    Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-11-01T03:00:00Z"), TOKYO);
    }
}
