package com.foodmanagement.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.foodmanagement.api.distribution.PlannerClient;
import com.foodmanagement.api.distribution.PlannerClient.Pick;
import com.foodmanagement.api.distribution.PlannerClient.Plan;
import com.foodmanagement.api.distribution.PlannerClient.PlanRequest;
import com.foodmanagement.api.distribution.PlannerClient.Report;
import com.foodmanagement.api.distribution.PlannerClient.ReportMovement;
import com.foodmanagement.api.distribution.PlannerClient.Totals;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * API を通しで確かめる。データベースは Testcontainers で起動した本物の PostgreSQL を使い、
 * Python の計算サービスだけを差し替える。「今日」は 2026-11-01 に固定。
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestConfig.class)
class ApiTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockitoBean PlannerClient planner;

    @BeforeEach
    void plannerReturnsEmpty() {
        when(planner.plan(any())).thenReturn(new Plan(List.of(), List.of()));
        when(planner.report(anyString(), anyList())).thenReturn(new Report("2026-11", List.of(), new Totals(0, 0, 0)));
    }

    // --- 認証と認可 ---

    @Test
    void healthAndApiDocsNeedNoLogin() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("FoodManagement API"));
    }

    @Test
    void everythingElseNeedsLogin() throws Exception {
        mvc.perform(get("/api/lots")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/lots").header("Authorization", "Bearer wrong"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("ログインしてください"));
    }

    @Test
    void registerLoginLogout() throws Exception {
        String email = uniqueEmail();
        String token = register("ひだまり食堂", email);
        mvc.perform(get("/api/me").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.organizationName").value("ひだまり食堂"))
                .andExpect(jsonPath("$.includeExpiredBestBefore").value(false));

        mvc.perform(json(post("/api/auth/register"), Map.of("organizationName", "別団体", "email", email, "password", "password123")))
                .andExpect(status().isConflict());
        mvc.perform(json(post("/api/auth/login"), Map.of("email", email, "password", "wrong-password")))
                .andExpect(status().isUnauthorized());

        String again = login(email);
        mvc.perform(post("/api/auth/logout").header("Authorization", bearer(again))).andExpect(status().isNoContent());
        mvc.perform(get("/api/me").header("Authorization", bearer(again))).andExpect(status().isUnauthorized());
    }

    @Test
    void onlyAdminsCanChangeSettingsAndAddStaff() throws Exception {
        String admin = register("食堂A", uniqueEmail());
        String staffEmail = uniqueEmail();
        mvc.perform(json(post("/api/staff"), Map.of("email", staffEmail, "password", "password123"))
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isCreated());
        String staff = login(staffEmail);

        mvc.perform(get("/api/me").header("Authorization", bearer(staff))).andExpect(jsonPath("$.role").value("STAFF"));
        mvc.perform(json(put("/api/organization/settings"), Map.of("includeExpiredBestBefore", true))
                        .header("Authorization", bearer(staff)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("この操作は管理者だけができます"));
        mvc.perform(json(post("/api/staff"), Map.of("email", uniqueEmail(), "password", "password123"))
                        .header("Authorization", bearer(staff)))
                .andExpect(status().isForbidden());

        mvc.perform(json(put("/api/organization/settings"), Map.of("includeExpiredBestBefore", true))
                        .header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.includeExpiredBestBefore").value(true));
    }

    // --- 入荷とバーコード ---

    @Test
    void receiveWithBarcodeAndLookItUpLater() throws Exception {
        String token = register("食堂B", uniqueEmail());
        mvc.perform(json(post("/api/lots"), lot("2000000000039", "サバ缶", "canned", 10, "2027-05-01"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.itemName").value("サバ缶"))
                .andExpect(jsonPath("$.receivedOn").value("2026-11-01"))
                .andExpect(jsonPath("$.version").value(0));

        mvc.perform(get("/api/items/by-jan/2000000000039").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("サバ缶"))
                .andExpect(jsonPath("$.category").value("canned"));
        mvc.perform(get("/api/items/by-jan/2000000000022").header("Authorization", bearer(token)))
                .andExpect(status().isNotFound());

        // チェックデジットが合わない番号は登録しない
        mvc.perform(json(post("/api/lots"), lot("2000000000038", "誤読", "canned", 1, "2027-05-01"))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void lotsAreSortedByExpiryAndHiddenFromOtherOrganizations() throws Exception {
        String mine = register("食堂C", uniqueEmail());
        receive(mine, null, "パン", "staple", 3, "2026-11-03");
        receive(mine, null, "パックごはん", "staple", 5, "2026-11-02");
        receive(mine, null, "お茶", "drink", 4, "2026-12-01");

        mvc.perform(get("/api/lots").header("Authorization", bearer(mine)))
                .andExpect(jsonPath("$[0].itemName").value("パックごはん"))
                .andExpect(jsonPath("$[1].itemName").value("パン"))
                .andExpect(jsonPath("$[2].itemName").value("お茶"));

        String theirs = register("食堂D", uniqueEmail());
        long lotId = receive(mine, null, "クッキー", "snack", 2, "2026-11-20").get("id").asLong();
        mvc.perform(get("/api/lots").header("Authorization", bearer(theirs))).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(json(post("/api/lots/" + lotId + "/dispose"), Map.of("quantity", 1, "version", 0))
                        .header("Authorization", bearer(theirs)))
                .andExpect(status().isNotFound());
    }

    // --- 楽観的ロック ---

    @Test
    void staleVersionIsRejectedWithConflict() throws Exception {
        String token = register("食堂E", uniqueEmail());
        long lotId = receive(token, null, "クッキー", "snack", 10, "2026-10-30").get("id").asLong();

        // A さんが version 0 を見て 3 個廃棄 → 成功して version 1
        mvc.perform(json(post("/api/lots/" + lotId + "/dispose"), Map.of("quantity", 3, "version", 0))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quantity").value(7))
                .andExpect(jsonPath("$.version").value(1));

        // B さんも version 0 を見ていた → 先に更新されているので 409、数は変わらない
        mvc.perform(json(post("/api/lots/" + lotId + "/dispose"), Map.of("quantity", 4, "version", 0))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("他のスタッフが先に「クッキー」を更新しました。最新の在庫で確認してください"));

        // 最新の version でも、在庫より多くは減らせない
        mvc.perform(json(post("/api/lots/" + lotId + "/dispose"), Map.of("quantity", 8, "version", 1))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("「クッキー」の在庫が足りません（残り 7 個）"));
    }

    @Test
    void distributionIsAllOrNothing() throws Exception {
        String token = register("食堂F", uniqueEmail());
        long rice = receive(token, null, "パックごはん", "staple", 10, "2026-11-05").get("id").asLong();
        long curry = receive(token, null, "カレー", "retort", 10, "2026-11-06").get("id").asLong();
        // 別のスタッフがカレーを先に 1 個廃棄 → カレーの version は 1 になる
        mvc.perform(json(post("/api/lots/" + curry + "/dispose"), Map.of("quantity", 1, "version", 0))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk());

        // ごはんは正しい version、カレーは古い version で確定 → 409 で全部取り消し
        var picks = List.of(
                Map.of("lotId", rice, "quantity", 4, "version", 0),
                Map.of("lotId", curry, "quantity", 4, "version", 0));
        mvc.perform(json(post("/api/distributions"), Map.of("picks", picks)).header("Authorization", bearer(token)))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/lots").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$[0].itemName").value("パックごはん"))
                .andExpect(jsonPath("$[0].quantity").value(10))
                .andExpect(jsonPath("$[0].version").value(0));

        // 最新の version なら確定でき、両方減る
        var fresh = List.of(
                Map.of("lotId", rice, "quantity", 4, "version", 0),
                Map.of("lotId", curry, "quantity", 4, "version", 1));
        mvc.perform(json(post("/api/distributions"), Map.of("picks", fresh)).header("Authorization", bearer(token)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/lots").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$[0].quantity").value(6))
                .andExpect(jsonPath("$[1].quantity").value(5));
    }

    // --- 計算サービスへの中継 ---

    @Test
    void planSendsOwnLotsTodayAndSettingAndAddsVersions() throws Exception {
        String token = register("食堂G", uniqueEmail());
        long rice = receive(token, null, "パックごはん", "staple", 6, "2026-11-03").get("id").asLong();
        when(planner.plan(any())).thenReturn(new Plan(
                List.of(new Pick(rice, "パックごはん", "staple", 4, "2026-11-03", 2, "期限まで2日")), List.of()));

        mvc.perform(json(post("/api/distributions/plan"), Map.of("households", 2, "perHousehold", Map.of("staple", 2)))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.today").value("2026-11-01"))
                .andExpect(jsonPath("$.picks[0].lotId").value(rice))
                .andExpect(jsonPath("$.picks[0].version").value(0));

        ArgumentCaptor<PlanRequest> request = ArgumentCaptor.forClass(PlanRequest.class);
        verify(planner).plan(request.capture());
        assertThat(request.getValue().today()).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(request.getValue().includeExpiredBestBefore()).isFalse();
        assertThat(request.getValue().lots()).extracting("id").containsExactly(rice);
    }

    @Test
    void planRejectsUnknownCategories() throws Exception {
        String token = register("食堂H", uniqueEmail());
        mvc.perform(json(post("/api/distributions/plan"), Map.of("households", 2, "perHousehold", Map.of("weapon", 1)))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @SuppressWarnings("unchecked")
    void monthlyReportSendsOnlyThatMonthsMovements() throws Exception {
        String token = register("食堂I", uniqueEmail());
        receive(token, null, "お茶", "drink", 5, "2026-12-01");

        mvc.perform(get("/api/reports/monthly?month=2026-11").header("Authorization", bearer(token)))
                .andExpect(status().isOk());
        ArgumentCaptor<List<ReportMovement>> movements = ArgumentCaptor.forClass(List.class);
        verify(planner).report(org.mockito.ArgumentMatchers.eq("2026-11"), movements.capture());
        assertThat(movements.getValue())
                .containsExactly(new ReportMovement("receive", "drink", 5, LocalDate.of(2026, 11, 1)));

        mvc.perform(get("/api/reports/monthly?month=2026/11").header("Authorization", bearer(token)))
                .andExpect(status().isBadRequest());
    }

    // --- 補助 ---

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, Object body) throws Exception {
        return builder.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }

    private Map<String, Object> lot(String jan, String name, String category, int quantity, String expiresOn) {
        var body = new java.util.HashMap<String, Object>(Map.of(
                "name", name, "category", category, "quantity", quantity, "expiresOn", expiresOn,
                "expiryType", "best_before"));
        if (jan != null) {
            body.put("jan", jan);
        }
        return body;
    }

    private JsonNode receive(String token, String jan, String name, String category, int quantity, String expiresOn)
            throws Exception {
        String body = mvc.perform(json(post("/api/lots"), lot(jan, name, category, quantity, expiresOn))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private String register(String organization, String email) throws Exception {
        String body = mvc.perform(json(post("/api/auth/register"),
                        Map.of("organizationName", organization, "email", email, "password", "password123")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("token").asText();
    }

    private String login(String email) throws Exception {
        String body = mvc.perform(json(post("/api/auth/login"), Map.of("email", email, "password", "password123")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("token").asText();
    }

    private static String uniqueEmail() {
        return "staff-" + UUID.randomUUID() + "@example.com";
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }
}
