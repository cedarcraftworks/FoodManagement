package com.foodmanagement.api.distribution;

import com.foodmanagement.api.web.AppProperties;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class HttpPlannerClient implements PlannerClient {

    private final RestClient http;

    public HttpPlannerClient(RestClient.Builder builder, AppProperties props) {
        this.http = builder.baseUrl(props.plannerUrl()).build();
    }

    @Override
    public Plan plan(PlanRequest request) {
        return post("/plan", request, Plan.class);
    }

    @Override
    public Report report(String month, List<ReportMovement> movements) {
        return post("/report", Map.of("month", month, "movements", movements), Report.class);
    }

    private <T> T post(String path, Object body, Class<T> type) {
        try {
            T result = http.post().uri(path).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(type);
            if (result == null) {
                throw new RestClientException("empty response");
            }
            return result;
        } catch (RestClientException e) {
            // 計算サービスが落ちていても、在庫の閲覧や入荷は使えるように API 全体は落とさない
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "計算サービスに接続できませんでした", e);
        }
    }
}
