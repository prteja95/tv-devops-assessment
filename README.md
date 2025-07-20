# TV DevOps Assessment - Part 1 & 2

--------------------------------------------------
### PART 1 - NODE.JS EXPRESS APP
--------------------------------------------------
Local Setup:
1. cd app
2. npm install
3. npm run build
4. npm start

Test Endpoint:
http://localhost:3000/health


Expected OUTPUT: {"status":"ok"}

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
####  this ensure that .env isolates different enivronments for dev/staging/Prod #####
AWS_ACCOUNT_ID=<your AWS account ID>


AWS_REGION=us-east-1 (or your preferred region)


APP_IMAGE_TAG=v2 (must match the Docker image tag you will push to ECR)

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
cdktf deploy

After deployment you will see outputs:
albDnsName → the load balancer DNS
ecrRepoUrl → the ECR repository where you will push your Docker image

### Push your application image to ECR

In the app/ folder, build an AWS-compatible image for linux/amd64:
docker buildx build --platform linux/amd64 -t tv-devops-app:v2 .

Tag the image for your ECR repo:
docker tag tv-devops-app:v2 <ECR_REPO_URL>:v2

Authenticate Docker to AWS ECR:
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

#### Push the image:
docker push <ECR_REPO_URL>:v2

## Redeploy ECS to pull the new image

aws ecs update-service
--cluster tv-devops-cluster
--service tv-devops-cluster-service
--force-new-deployment
--region us-east-1

This forces ECS to restart the task and pull the latest image with the tag you provided.

Test the final deployment

Take the albDnsName from the cdktf deploy output, open in browser:
http://<albDnsName>/health

It should return:

{"status":"ok"}

This confirms that the ECS service is healthy and publicly accessible.

#### Destroy the stack

When you want to clean up:

cdktf destroy

This removes all AWS resources created (VPC, ECS, ALB, ECR, IAM roles)..
##### NOTE : MIGHT FAIL ON ECR IF ITS HAS IMAGES, PLEASE DELETE THEM MANUALLY BEFORE YOU RUN THIS COMMAND

This process ensures:

Variables can be easily overridden per account using the .env file
The stack can be deployed and destroyed safely
#### Final deployment always exposes a /health endpoint via a public ALB 


