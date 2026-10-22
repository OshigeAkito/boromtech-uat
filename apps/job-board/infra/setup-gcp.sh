#!/usr/bin/env bash
# One-time Google Cloud setup for crew-api. Run once from a machine logged in with `gcloud auth login` as the
# project owner, after creating the project and linking a billing account in the console (the two steps that
# need a browser and a card). Every command is safe to re-run.
#
#   PROJECT=boromtech-crew REPO=Borom-Tech/boromtech ./setup-gcp.sh
set -euo pipefail
: "${PROJECT:?}" "${REPO:?}"
REGION=asia-southeast1
gcloud config set project "$PROJECT"
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

# Images: one repository, keep the 10 newest (the Artifact Registry free tier is 0.5 GB).
gcloud artifacts repositories create crew --repository-format=docker --location="$REGION" || true
gcloud artifacts repositories set-cleanup-policies crew --location="$REGION" --policy=- <<'JSON'
[{"name":"keep-10","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":10}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]
JSON

# Two service accounts: the runtime reads its own secrets and nothing else; the deployer is CI.
gcloud iam service-accounts create crew-runtime  --display-name="crew-api runtime" || true
gcloud iam service-accounts create crew-deployer --display-name="GitHub Actions deployer" || true
RUNTIME=crew-runtime@$PROJECT.iam.gserviceaccount.com
DEPLOYER=crew-deployer@$PROJECT.iam.gserviceaccount.com

# Runtime secrets, typed in here and never stored in the repo or GitHub:
#   crew-database-url          postgres://bt_gateway:…@<neon POOLED host>/neondb?sslmode=require
#   crew-google-client-secret  the OAuth client's secret
#   crew-r2-secret-access-key  R2 token "crew-api" (Object Read & Write, bucket bt-crew-files only)
#   crew-edge-key              random string, also set as the Worker secret EDGE_KEY
for s in crew-database-url crew-google-client-secret crew-r2-secret-access-key crew-edge-key; do
  gcloud secrets describe "$s" >/dev/null 2>&1 || {
    read -rsp "value for $s: " v; echo
    printf %s "$v" | gcloud secrets create "$s" --replication-policy=user-managed --locations="$REGION" --data-file=-
  }
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor >/dev/null
done

# Deployer: push images, deploy the one service, act as the runtime account. Nothing else.
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOYER" --role=roles/run.developer >/dev/null
gcloud artifacts repositories add-iam-policy-binding crew --location="$REGION" \
  --member="serviceAccount:$DEPLOYER" --role=roles/artifactregistry.writer >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser >/dev/null

# Workload Identity Federation: GitHub OIDC tokens from this repository's main branch only. No JSON keys.
gcloud iam workload-identity-pools create github --location=global --display-name=GitHub || true
gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref' \
  --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'" || true
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null

echo
echo "Set these GitHub repository variables:"
echo "  GCP_PROJECT_ID=$PROJECT"
echo "  GCP_WIF_PROVIDER=projects/$NUM/locations/global/workloadIdentityPools/github/providers/github"
echo "  GCP_DEPLOY_SA=$DEPLOYER"
echo "Then add a \$1 budget alert: Billing → Budgets & alerts."
