package com.foodmanagement.api.web;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/** /swagger-ui.html に API 仕様書を自動で表示する。右上の Authorize にトークンを入れると試せる。 */
@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "FoodManagement API",
                version = "1.0.0",
                description = "子ども食堂・フードバンクの在庫と配布の管理"),
        security = @SecurityRequirement(name = "bearer"))
@SecurityScheme(name = "bearer", type = SecuritySchemeType.HTTP, scheme = "bearer")
public class OpenApiConfig {}
