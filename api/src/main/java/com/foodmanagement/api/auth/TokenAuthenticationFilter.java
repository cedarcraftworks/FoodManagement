package com.foodmanagement.api.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authorization: Bearer &lt;token&gt; を確認し、有効ならスタッフと役割（ROLE_ADMIN / ROLE_STAFF）を
 * Spring Security に登録する。役割は @PreAuthorize("hasRole('ADMIN')") の判定に使われる。
 *
 * <p>@Component にすると Spring Boot が通常のサーブレットフィルターとしても登録してしまい、
 * 2 回実行されるので、SecurityConfig の中で new して使う。
 */
public class TokenAuthenticationFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer ";

    private final AuthService auth;

    public TokenAuthenticationFilter(AuthService auth) {
        this.auth = auth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        tokenOf(request).flatMap(auth::userFor).ifPresent(user -> {
            var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + user.role()));
            var authentication = new UsernamePasswordAuthenticationToken(user, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authentication);
        });
        chain.doFilter(request, response);
    }

    static Optional<String> tokenOf(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(PREFIX) || header.length() == PREFIX.length()) {
            return Optional.empty();
        }
        return Optional.of(header.substring(PREFIX.length()).trim());
    }
}
