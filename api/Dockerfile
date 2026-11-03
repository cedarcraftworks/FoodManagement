FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY api/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY api/src ./src
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/api-1.0.0.jar app.jar
USER nobody
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
