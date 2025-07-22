# Infrastructure Deployment Guide

This guide explains how to deploy the AWS infrastructure for the Express app using
CDK for Terraform (CDKTF) and the provided GitHub Actions workflow. It also
covers the manual resources you must create ahead of time such as the Terraform
state bucket and optional ACM certificates.

## Prerequisites

1. An AWS account with programmatic access.
2. A manually created S3 bucket to store Terraform state (`TF_STATE_BUCKET`).
3. If HTTPS is required, an existing Route53 hosted zone and ACM certificate for
   your domain. The certificate must be in the `us-east-1` region when using an
   Application Load Balancer.
4. Node.js 20 and npm installed locally for any manual deployments.

## Configure GitHub Secrets and Variables

The workflow in `.github/workflows/deploy.yml` deploys the stack on every push to
`main`. Configure the following repository secrets:

- `AWS_ACCESS_KEY_ID` – IAM access key with privileges to create the resources.
- `AWS_SECRET_ACCESS_KEY` – secret for the above key.
- `AWS_ACCOUNT_ID` – your AWS account ID.

Define the remaining values as repository **variables**. They mirror the options
in `iac/.env.example`:

```
AWS_REGION
CUSTOM_VPC_CIDR
PUBLIC_SUBNET_CIDR_A
PUBLIC_SUBNET_CIDR_B
PRIVATE_SUBNET_CIDR_A
PRIVATE_SUBNET_CIDR_B
APP_REPO_NAME
APP_CLUSTER_NAME
APP_IMAGE_TAG
CONTAINER_PORT
ALB_PORT
DESIRED_TASKS
ALB_ALLOWED_CIDRS
SG_EGRESS_CIDRS
ECS_CPU
ECS_MEMORY
LOG_RETENTION_DAYS
TF_STATE_BUCKET
DOMAIN_NAME            # required when enabling HTTPS
EXISTING_CERTIFICATE_ARN # optional ACM certificate ARN
ENABLE_HTTPS           # set to "true" to create the HTTPS listener
```

## Manual Setup

1. **Create the state bucket** – make an S3 bucket and enable versioning. Supply
   its name as `TF_STATE_BUCKET` in your variables.
2. **Create or import an ACM certificate** – if you already have a certificate
   for your Route53 zone, set `EXISTING_CERTIFICATE_ARN`. Otherwise set
   `ENABLE_HTTPS=true` and leave `EXISTING_CERTIFICATE_ARN` blank to let CDKTF
   request one. Validation DNS records will be output and must be added to your
   hosted zone before the certificate becomes active.

## Deploy Using GitHub Actions

Push your changes to the `main` branch. The workflow performs these steps:

1. Install CDKTF and Terraform.
2. Deploy or update the infrastructure defined in `iac/main.ts` using the values
   from your repository variables.
3. Build the Docker image from `app/` and push it to the created ECR repository.
4. Force a new ECS deployment so the service pulls the latest image.

Monitor the Actions tab in GitHub to view progress. When complete, note the
`albDnsName` output which is shown in the workflow logs.

## Verifying DNS Records and HTTPS

To inspect the created Route53 records and retrieve the load balancer URL
manually, run from the `iac/` directory:

```bash
terraform output
```

If HTTPS is enabled, wait for the ACM certificate status to become `ISSUED` in
the AWS console. The output `appUrl` will show an `https://` URL once the
certificate is active and the DNS validation records have propagated.

## Manual Deployment Alternative

You can also deploy locally without GitHub Actions:

```bash
cd iac
npm ci
cdktf get
cdktf deploy
```

This uses the same variables defined above. Ensure the state bucket and optional
certificate exist beforehand.
