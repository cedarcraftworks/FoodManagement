package com.foodmanagement.api.web;

import java.time.ZoneId;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** application.yml の food-management.* の設定。 */
@ConfigurationProperties("food-management")
public record AppProperties(String plannerUrl, int sessionDays, ZoneId timeZone, List<String> allowedOrigins) {}
