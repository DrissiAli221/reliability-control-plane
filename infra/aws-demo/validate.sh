#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
terraform fmt -check -recursive
terraform init -backend=false -lockfile=readonly -input=false -no-color
terraform validate -no-color
python3 -m unittest discover -s tests -v
node --test github-oidc/index.test.mjs
# No real credential/profile/state lookup, and no AWS data sources.
export AWS_ACCESS_KEY_ID=offline AWS_SECRET_ACCESS_KEY=offline
export AWS_EC2_METADATA_DISABLED=true AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null
unset AWS_PROFILE AWS_DEFAULT_PROFILE AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
validation_dir="$(mktemp -d)"
trap 'rm -rf "$validation_dir"' EXIT
# -state isolates validation from any existing deployed demo state.
terraform plan -refresh=false -input=false -lock=false -state="$validation_dir/empty.tfstate" \
    -var-file=offline.tfvars -out="$validation_dir/demo.tfplan" -no-color
terraform show -json "$validation_dir/demo.tfplan" > "$validation_dir/plan.json"
python3 check_plan.py "$validation_dir/plan.json"
# Second plan with both social providers on, using obviously fake client credentials.
TF_VAR_google_client_id=fake-google-id TF_VAR_google_client_secret=fake-google-secret \
TF_VAR_github_client_id=fake-github-id TF_VAR_github_client_secret=fake-github-secret \
    terraform plan -refresh=false -input=false -lock=false -state="$validation_dir/empty.tfstate" \
    -var-file=offline.tfvars -var='social_providers=["Google","GitHub"]' \
    -out="$validation_dir/social.tfplan" -no-color
terraform show -json "$validation_dir/social.tfplan" > "$validation_dir/social.json"
python3 check_plan.py "$validation_dir/social.json"
