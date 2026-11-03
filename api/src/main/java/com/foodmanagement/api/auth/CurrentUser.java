package com.foodmanagement.api.auth;

/**
 * ログイン中のスタッフ。コントローラーは @AuthenticationPrincipal CurrentUser で受け取り、
 * organizationId で必ずデータを絞り込む。
 */
public record CurrentUser(long userId, long organizationId, String role) {

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }
}
