FROM eclipse-temurin:21-jdk-jammy AS build

WORKDIR /workspace

COPY pom.xml ./pom.xml
COPY rcp-probe-core/pom.xml ./rcp-probe-core/pom.xml
COPY rcp-control-plane/pom.xml ./rcp-control-plane/pom.xml
COPY rcp-probe-lambda/pom.xml ./rcp-probe-lambda/pom.xml
COPY rcp-control-plane/.mvn ./rcp-control-plane/.mvn
COPY rcp-control-plane/mvnw ./rcp-control-plane/mvnw

RUN chmod +x ./rcp-control-plane/mvnw \
    && ./rcp-control-plane/mvnw -pl rcp-control-plane -am dependency:go-offline

COPY rcp-probe-core/src ./rcp-probe-core/src
COPY rcp-control-plane/src ./rcp-control-plane/src

RUN ./rcp-control-plane/mvnw -pl rcp-control-plane -am package -DskipTests

FROM eclipse-temurin:21-jre-jammy

RUN groupadd --system --gid 10001 rcp \
    && useradd --system --uid 10001 --gid rcp --home-dir /app --shell /usr/sbin/nologin rcp

WORKDIR /app
COPY --from=build --chown=rcp:rcp \
    /workspace/rcp-control-plane/target/rcp-control-plane-0.0.1-SNAPSHOT-exec.jar \
    /app/rcp-control-plane.jar

USER 10001:10001
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/rcp-control-plane.jar"]
