package com.foodmanagement.api.auth;

import com.foodmanagement.api.web.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 団体の登録、スタッフの追加、ログイン・ログアウトとトークンの確認。
 *
 * <p>トークンはランダムな 32 バイト。データベースには SHA-256 のハッシュだけを保存するので、
 * データベースが漏れてもそのままでは使えない。パスワードは BCrypt でハッシュ化する。
 */
@Service
public class AuthService {

    record UserRow(long id, String passwordHash) {}

    private final JdbcClient db;
    private final PasswordEncoder encoder;
    private final SecureRandom random = new SecureRandom();
    private final Duration sessionLength;

    public AuthService(JdbcClient db, AppProperties props, PasswordEncoder encoder) {
        this.db = db;
        this.encoder = encoder;
        this.sessionLength = Duration.ofDays(props.sessionDays());
    }

    /** 団体を作り、登録した人をその団体の管理者にする。 */
    @Transactional
    public String registerOrganization(String organizationName, String email, String password) {
        long organizationId = db.sql("INSERT INTO organizations (name) VALUES (:name) RETURNING id")
                .param("name", organizationName.trim())
                .query(Long.class)
                .single();
        return issueToken(createUser(organizationId, email, password, "ADMIN"));
    }

    /** 管理者がスタッフを追加する。 */
    @Transactional
    public void addStaff(long organizationId, String email, String password) {
        createUser(organizationId, email, password, "STAFF");
    }

    private long createUser(long organizationId, String email, String password, String role) {
        try {
            return db.sql("""
                            INSERT INTO users (organization_id, email, password_hash, role)
                            VALUES (:org, :email, :hash, :role) RETURNING id""")
                    .param("org", organizationId)
                    .param("email", normalize(email))
                    .param("hash", encoder.encode(password))
                    .param("role", role)
                    .query(Long.class)
                    .single();
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "このメールアドレスはすでに登録されています");
        }
    }

    @Transactional
    public String login(String email, String password) {
        Optional<UserRow> user = db.sql("SELECT id, password_hash FROM users WHERE email = :email")
                .param("email", normalize(email))
                .query(UserRow.class)
                .optional();
        // メールアドレスが違うのかパスワードが違うのかは、どちらも同じ返事にする
        if (user.isEmpty() || !encoder.matches(password, user.get().passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "メールアドレスかパスワードが違います");
        }
        return issueToken(user.get().id());
    }

    public void logout(String token) {
        db.sql("DELETE FROM sessions WHERE token_hash = :hash").param("hash", hash(token)).update();
    }

    /** 有効なトークンなら、そのスタッフを返す。 */
    public Optional<CurrentUser> userFor(String token) {
        return db.sql("""
                        SELECT u.id AS user_id, u.organization_id, u.role
                        FROM sessions s JOIN users u ON u.id = s.user_id
                        WHERE s.token_hash = :hash AND s.expires_at > :now""")
                .param("hash", hash(token))
                .param("now", OffsetDateTime.now())
                .query(CurrentUser.class)
                .optional();
    }

    private String issueToken(long userId) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        db.sql("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (:hash, :user, :expires)")
                .param("hash", hash(token))
                .param("user", userId)
                .param("expires", OffsetDateTime.now().plus(sessionLength))
                .update();
        return token;
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
