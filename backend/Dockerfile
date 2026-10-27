# Build stage: dependencies are resolved in their own layer so code-only
# changes rebuild in seconds.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package -DskipTests

# Runtime: JRE plus ffmpeg/ffprobe, which AudioConverter runs as subprocesses.
FROM eclipse-temurin:21-jre
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home gist \
 && mkdir -p /data/storage && chown gist /data/storage
USER gist
WORKDIR /app
COPY --from=build /src/target/gist-backend-*.jar app.jar
ENV GIST_STORAGE_DIR=/data/storage
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
