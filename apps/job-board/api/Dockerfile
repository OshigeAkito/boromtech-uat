# Build context: this directory. Cloud Run runs amd64: build with
#   docker build --platform linux/amd64 -t crew-api apps/job-board/api
# (the Go cross-compiles natively on the build host; no emulation).
# One static binary on distroless/static (CA certs, tzdata, nonroot user, no shell): a small image keeps
# Cloud Run's image fetch off the cold-start path.
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /crew-api .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /crew-api /crew-api
USER nonroot:nonroot
ENTRYPOINT ["/crew-api"]
