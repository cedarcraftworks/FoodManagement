package com.foodmanagement.api.organization;

import com.foodmanagement.api.auth.AuthService;
import com.foodmanagement.api.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** ログイン中のスタッフと団体の情報、管理者だけの操作（設定の変更、スタッフの追加）。 */
@RestController
public class OrganizationController {

    public record Me(String email, String role, String organizationName, boolean includeExpiredBestBefore) {}

    public record Settings(@NotNull Boolean includeExpiredBestBefore) {}

    public record NewStaff(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72, message = "8文字以上72文字以内にしてください") String password) {}

    private final JdbcClient db;
    private final AuthService auth;

    public OrganizationController(JdbcClient db, AuthService auth) {
        this.db = db;
        this.auth = auth;
    }

    @GetMapping("/api/me")
    public Me me(@AuthenticationPrincipal CurrentUser user) {
        return db.sql("""
                        SELECT u.email, u.role, o.name AS organization_name, o.include_expired_best_before
                        FROM users u JOIN organizations o ON o.id = u.organization_id
                        WHERE u.id = :id""")
                .param("id", user.userId())
                .query(Me.class)
                .single();
    }

    @PutMapping("/api/organization/settings")
    @PreAuthorize("hasRole('ADMIN')")
    public Me updateSettings(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody Settings body) {
        db.sql("UPDATE organizations SET include_expired_best_before = :value WHERE id = :id")
                .param("value", body.includeExpiredBestBefore())
                .param("id", user.organizationId())
                .update();
        return me(user);
    }

    @PostMapping("/api/staff")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public void addStaff(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody NewStaff body) {
        auth.addStaff(user.organizationId(), body.email(), body.password());
    }
}
