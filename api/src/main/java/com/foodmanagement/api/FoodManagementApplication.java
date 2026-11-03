package com.foodmanagement.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

// ログインは独自のトークンで行うため、Spring Boot が用意する仮のユーザーは作らない
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class FoodManagementApplication {

    public static void main(String[] args) {
        SpringApplication.run(FoodManagementApplication.class, args);
    }
}
