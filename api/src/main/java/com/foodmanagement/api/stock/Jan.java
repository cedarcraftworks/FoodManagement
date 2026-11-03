package com.foodmanagement.api.stock;

/** JAN コード（13 桁・8 桁）のチェックデジットを確かめる。読み間違いや打ち間違いを見つけられる。 */
public final class Jan {

    private Jan() {}

    public static boolean isValid(String code) {
        if (code == null || !code.matches("\\d{8}|\\d{13}")) {
            return false;
        }
        int sum = 0;
        // チェックデジットの左隣から右→左に、3, 1, 3, 1 ... の重みをかける
        for (int i = code.length() - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
            sum += (code.charAt(i) - '0') * weight;
        }
        int check = (10 - sum % 10) % 10;
        return check == code.charAt(code.length() - 1) - '0';
    }
}
