# TV DevOps Assessment - Part 1 & 2

--------------------------------------------------
### PART 1 - NODE.JS EXPRESS APP
--------------------------------------------------
Local Setup:
1. cd app
2. npm install
3. npm run build
4. npm start

### Local testing with Docker Compose

Alternatively, you can start the application in a container:

```bash
cd app
docker compose up --build
```

This exposes the service on `http://localhost:3000/health`.

Test Endpoint:
http://localhost:3000/health


Expected OUTPUT: {"status":"ok"} or app response :  

## Hello World from Express + TypeScript!

--------------------------------------------------
### PART 2 - AWS INFRASTRUCTURE (CDKTF)
--------------------------------------------------
 Provisioned Resources VIA CDKTF DEPLOYMENT:
- VPC with Public/Private Subnets
- ECS Fargate Cluster
- ECR Repository
- Application Load Balancer
- IAM Roles & Security Groups
- ##### CloudWatch Logs ENABLED FOR ECR HELPS TO IDENTIFY ANY DEPLOYEMNY ISSUE RELATED TO IMAGES #


##  Override variables to use your AWS account

Navigate to the iac/ folder

Copy the example environment file:
cp .env.example .env

Open .env and update the required ### INPUTS ### variables with your AWS account details 
Open .env and update the required ### INPUTS ### variables with your AWS account details
####  this ensure that .env isolates different enivronments for dev/staging/Prod #####
AWS_ACCOUNT_ID=<your AWS account ID>


AWS_REGION=us-east-1 (or your preferred region)


APP_IMAGE_TAG=v2 (must match the Docker image tag you will push to ECR)

### Available .env variables

The file `iac/.env.example` contains all tunables used by the CDK stack:

```
AWS_REGION
AWS_ACCOUNT_ID
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
ACM_CERTIFICATE_ARN
```

Create `.env` from the example file and adjust these values as needed.

### You can also customize:

CUSTOM_VPC_CIDR and subnet CIDRs if needed
ALB_ALLOWED_CIDRS if you want to restrict access
ECS_CPU and ECS_MEMORY if you want to change Fargate sizing

## PREPARE the STACK FOR CLOUD DEPLOYMENT 

Make sure AWS CLI is configured with your account
aws sts get-caller-identity should return your account details

From the iac/ folder, install dependencies:
npm install

Generate Terraform provider bindings:
cdktf get

## Deploy the stack:
From the `iac/` directory run:

```bash
cdktf deploy
```

The command reads variables from your `.env` file and an existing `TF_STATE_BUCKET` must be set to an S3 bucket for state storage.


--cluster tv-devops-cluster
--service tv-devops-cluster-service
--force-new-deployment
