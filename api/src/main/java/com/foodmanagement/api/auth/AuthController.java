package com.foodmanagement.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record Registration(
            @NotBlank @Size(max = 200) String organizationName,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72, message = "8文字以上72文字以内にしてください") String password) {}

    public record Credentials(@NotBlank @Email String email, @NotBlank String password) {}

    public record TokenResponse(String token) {}

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenResponse register(@Valid @RequestBody Registration body) {
        return new TokenResponse(auth.registerOrganization(body.organizationName(), body.email(), body.password()));
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody Credentials body) {
        return new TokenResponse(auth.login(body.email(), body.password()));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request) {
        TokenAuthenticationFilter.tokenOf(request).ifPresent(auth::logout);
    }
}
