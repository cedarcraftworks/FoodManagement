package com.foodmanagement.api.web;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 「今日」の決め方を 1 か所にまとめる。テストでは固定の時計に差し替え、
 * どの日に実行しても同じ結果になるようにする。
 */
@Configuration
public class ClockConfig {

    @Bean
    Clock clock(AppProperties props) {
        return Clock.system(props.timeZone());
    }
}
