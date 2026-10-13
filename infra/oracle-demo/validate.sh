#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
terraform fmt -check -recursive
terraform init -backend=false -lockfile=readonly -input=false -no-color
terraform validate -no-color

validation_dir="$(mktemp -d)"
trap 'rm -rf "$validation_dir"' EXIT
umask 077
openssl genrsa -out "$validation_dir/offline.pem" 2048 2>/dev/null
# The plan uses explicit fake credentials and no data sources. Isolate state and
# user tfvars as well: copy only tracked configuration to a disposable root.
cp ./*.tf ./offline.tfvars ./.terraform.lock.hcl "$validation_dir/"
cp -R scripts "$validation_dir/"
ln -s "$PWD/.terraform" "$validation_dir/.terraform"
unset OCI_AUTH OCI_USER_OCID OCI_TENANCY_OCID OCI_FINGERPRINT OCI_PRIVATE_KEY \
  OCI_PRIVATE_KEY_PATH OCI_PRIVATE_KEY_PASSWORD OCI_CONFIG_FILE_PROFILE OCI_REGION \
  OCI_SECURITY_TOKEN_FILE TF_VAR_auth TF_VAR_user_ocid TF_VAR_fingerprint \
  TF_VAR_private_key TF_VAR_private_key_path TF_VAR_private_key_password \
  TF_VAR_security_token_file
terraform -chdir="$validation_dir" plan -refresh=false -input=false -lock=false \
  -var-file=offline.tfvars -var="offline_private_key_path=$validation_dir/offline.pem" \
  -out="$validation_dir/demo.tfplan" -no-color
terraform -chdir="$validation_dir" show -json "$validation_dir/demo.tfplan" > "$validation_dir/plan.json"
python3 check_plan.py --offline "$validation_dir/plan.json"
RCP_ORACLE_TEST_PLAN="$validation_dir/plan.json" python3 -m unittest discover -s tests -v
