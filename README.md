# TV DevOps Assessment - Part 1 & 2

--------------------------------------------------
### PART 1 - NODE.JS EXPRESS APP
--------------------------------------------------
Features:
- Health endpoint: /health -> {"status":"ok"}
- Multi-stage Docker container
- TypeScript support

Local Setup:
1. cd app
2. npm install
3. npm run build
4. npm start

Test Endpoint:
http://localhost:3000/health
Expected: {"status":"ok"}

--------------------------------------------------
### PART 2 - AWS INFRASTRUCTURE (CDKTF)
--------------------------------------------------
Provisioned Resources:
- VPC with Public/Private Subnets
- ECS Fargate Cluster
- ECR Repository
- Application Load Balancer
- IAM Roles & Security Groups
- CloudWatch Logs

Deployment Steps:
1. Install tools:
   npm install -g cdktf-cli
   aws configure

2. Prepare environment:
   cd iac
   cp .env.example .env
   # Edit .env with your AWS credentials

3. Deploy infrastructure:
   cdktf get
   cdktf deploy

4. Clean up:
   cdktf destroy
