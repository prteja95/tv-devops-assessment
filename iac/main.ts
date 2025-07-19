import * as dotenv from "dotenv";
const envFilePath = process.env.ENV_FILE || ".env";
dotenv.config({ path: envFilePath });
console.log(`Loaded env file: ${envFilePath}`);

import { App, TerraformStack, TerraformOutput } from "cdktf";
import { Construct } from "constructs";

// AWS Resources
import { AwsProvider } from "./.gen/providers/aws/provider";
import { Vpc } from "./.gen/providers/aws/vpc";
import { Subnet } from "./.gen/providers/aws/subnet";
import { InternetGateway } from "./.gen/providers/aws/internet-gateway";
import { RouteTable } from "./.gen/providers/aws/route-table";
import { RouteTableAssociation } from "./.gen/providers/aws/route-table-association";
import { Route } from "./.gen/providers/aws/route";
import { Eip } from "./.gen/providers/aws/eip";
import { NatGateway } from "./.gen/providers/aws/nat-gateway";
import { SecurityGroup } from "./.gen/providers/aws/security-group";
import { Lb } from "./.gen/providers/aws/lb";
import { LbTargetGroup } from "./.gen/providers/aws/lb-target-group";
import { LbListener } from "./.gen/providers/aws/lb-listener";
import { EcrRepository } from "./.gen/providers/aws/ecr-repository";
import { EcsCluster } from "./.gen/providers/aws/ecs-cluster";
import { IamRole } from "./.gen/providers/aws/iam-role";
import { IamRolePolicyAttachment } from "./.gen/providers/aws/iam-role-policy-attachment";
import { EcsTaskDefinition } from "./.gen/providers/aws/ecs-task-definition";
import { EcsService } from "./.gen/providers/aws/ecs-service";
import { CloudwatchLogGroup } from "./.gen/providers/aws/cloudwatch-log-group"; 

//  Validate env vars
function validateEnv(vars: string[]) {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

// Required variables
validateEnv([
  "AWS_REGION",
  "AWS_ACCOUNT_ID",
  "APP_REPO_NAME",
  "APP_CLUSTER_NAME",
  "CUSTOM_VPC_CIDR",
  "PUBLIC_SUBNET_CIDR_A",
  "PUBLIC_SUBNET_CIDR_B",
  "PRIVATE_SUBNET_CIDR_A",
  "PRIVATE_SUBNET_CIDR_B"
]);

class TvDevOpsStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    //  Load env
    const region = process.env.AWS_REGION!;
    const awsAccountId = process.env.AWS_ACCOUNT_ID!;
    const vpcCidr = process.env.CUSTOM_VPC_CIDR!;
    const pubCidrA = process.env.PUBLIC_SUBNET_CIDR_A!;
    const pubCidrB = process.env.PUBLIC_SUBNET_CIDR_B!;
    const privCidrA = process.env.PRIVATE_SUBNET_CIDR_A!;
    const privCidrB = process.env.PRIVATE_SUBNET_CIDR_B!;

    const appRepoName = process.env.APP_REPO_NAME!;
    const appClusterName = process.env.APP_CLUSTER_NAME!;
    const imageTag = process.env.APP_IMAGE_TAG!; // must declare specific version in env

    const containerPort = Number(process.env.CONTAINER_PORT || "3000");
    const desiredTasks = Number(process.env.DESIRED_TASKS || "1");
    const albPort = Number(process.env.ALB_PORT || "80");

    const albAllowedCidrs = (process.env.ALB_ALLOWED_CIDRS || "0.0.0.0/0").split(",");
    const sgEgressCidrs = (process.env.SG_EGRESS_CIDRS || "0.0.0.0/0").split(",");
    const ecsCpu = process.env.ECS_CPU || "256";
    const ecsMemory = process.env.ECS_MEMORY || "512";
    const logRetention = Number(process.env.LOG_RETENTION_DAYS || "7");

    const azA = `${region}a`;
    const azB = `${region}b`;

    new AwsProvider(this, "aws", { region });

    //  VPC
    const vpc = new Vpc(this, "customVpc", {
      cidrBlock: vpcCidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    //  Internet Gateway
    const igw = new InternetGateway(this, "igw", { vpcId: vpc.id });

    //  Multi-AZ Public Subnets
    const publicSubnetA = new Subnet(this, "publicSubnetA", {
      vpcId: vpc.id,
      cidrBlock: pubCidrA,
      availabilityZone: azA,
      mapPublicIpOnLaunch: true,
    });
    const publicSubnetB = new Subnet(this, "publicSubnetB", {
      vpcId: vpc.id,
      cidrBlock: pubCidrB,
      availabilityZone: azB,
      mapPublicIpOnLaunch: true,
    });

    //  Public RT → IGW
    const publicRT = new RouteTable(this, "publicRT", { vpcId: vpc.id });
    new Route(this, "publicInternetRoute", {
      routeTableId: publicRT.id,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: igw.id,
    });
    new RouteTableAssociation(this, "pubAssocA", { subnetId: publicSubnetA.id, routeTableId: publicRT.id });
    new RouteTableAssociation(this, "pubAssocB", { subnetId: publicSubnetB.id, routeTableId: publicRT.id });

    //  NAT Gateway in PublicSubnetA
    const natEip = new Eip(this, "natEip", { domain: "vpc" });
    const natGw = new NatGateway(this, "natGw", {
      allocationId: natEip.allocationId,
      subnetId: publicSubnetA.id,
    });

    //  Multi-AZ Private Subnets
    const privateSubnetA = new Subnet(this, "privateSubnetA", {
      vpcId: vpc.id,
      cidrBlock: privCidrA,
      availabilityZone: azA,
    });
    const privateSubnetB = new Subnet(this, "privateSubnetB", {
      vpcId: vpc.id,
      cidrBlock: privCidrB,
      availabilityZone: azB,
    });

    //  Private RT → NAT
    const privateRT = new RouteTable(this, "privateRT", { vpcId: vpc.id });
    new Route(this, "privateNatRoute", {
      routeTableId: privateRT.id,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: natGw.id,
    });
    new RouteTableAssociation(this, "privAssocA", { subnetId: privateSubnetA.id, routeTableId: privateRT.id });
    new RouteTableAssociation(this, "privAssocB", { subnetId: privateSubnetB.id, routeTableId: privateRT.id });

    const publicSubnets = [publicSubnetA.id, publicSubnetB.id];
    const privateSubnets = [privateSubnetA.id, privateSubnetB.id];

    //  ECS Cluster
    const ecsCluster = new EcsCluster(this, "ecsCluster", { name: appClusterName });

    //  Security Groups
    const albSg = new SecurityGroup(this, "albSg", {
      name: "alb-sg",
      description: "Allow inbound HTTP traffic to ALB",
      vpcId: vpc.id,
      ingress: albAllowedCidrs.map((cidr) => ({
        fromPort: albPort,
        toPort: albPort,
        protocol: "tcp",
        cidrBlocks: [cidr],
      })),
      egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: sgEgressCidrs }],
    });

    const ecsSg = new SecurityGroup(this, "ecsSg", {
      name: "ecs-tasks-sg",
      description: "Allow only ALB to ECS traffic",
      vpcId: vpc.id,
      ingress: [
        {
          fromPort: containerPort,
          toPort: containerPort,
          protocol: "tcp",
          securityGroups: [albSg.id],
        },
      ],
      egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: sgEgressCidrs }],
    });

    //  ECR Repo
    const ecrRepo = new EcrRepository(this, "appRepo", { name: appRepoName });

    //  ALB across AZs
    const alb = new Lb(this, "alb", {
      name: "tv-devops-alb",
      loadBalancerType: "application",
      subnets: publicSubnets,
      securityGroups: [albSg.id],
    });

    const targetGroup = new LbTargetGroup(this, "tg", {
      name: "ecs-tg",
      port: containerPort,
      protocol: "HTTP",
      vpcId: vpc.id,
      targetType: "ip",
      healthCheck: {
        path: "/health",
        healthyThreshold: 2,
        unhealthyThreshold: 2,
        interval: 30,
        timeout: 5,
      },
    });

    new LbListener(this, "listener", {
      loadBalancerArn: alb.arn,
      port: albPort,
      protocol: "HTTP",
      defaultAction: [{ type: "forward", targetGroupArn: targetGroup.arn }],
    });

    //  IAM Role for ECS Tasks
    const ecsTaskRole = new IamRole(this, "ecsTaskRole", {
      name: `ecsTaskRole-${Date.now()}`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
          Action: "sts:AssumeRole",
        }],
      }),
    });
    new IamRolePolicyAttachment(this, "ecsTaskPolicyAttach", {
      role: ecsTaskRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    });

    //  CloudWatch Log Group (USED in ECS)
    const logGroup = new CloudwatchLogGroup(this, "ecsLogGroup", {
      name: `/ecs/${appClusterName}`,
      retentionInDays: logRetention,
    });

    //  ECS Task Definition with Logs
    const ecsTaskDef = new EcsTaskDefinition(this, "ecsTaskDef", {
      family: `${appClusterName}-task`,
      requiresCompatibilities: ["FARGATE"],
      networkMode: "awsvpc",
      cpu: ecsCpu,
      memory: ecsMemory,
      executionRoleArn: ecsTaskRole.arn,
      containerDefinitions: JSON.stringify([
        {
          name: "app",
          image: `${awsAccountId}.dkr.ecr.${region}.amazonaws.com/${appRepoName}:${imageTag}`,
          essential: true,
          portMappings: [
            { containerPort: containerPort, hostPort: containerPort, protocol: "tcp" }
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroup.name,    
              "awslogs-region": region,
              "awslogs-stream-prefix": "ecs",
            }
          }
        },
      ]),
    });

    //  ECS Service (Private subnets)
    new EcsService(this, "ecsService", {
      name: `${appClusterName}-service`,
      cluster: ecsCluster.id,
      taskDefinition: ecsTaskDef.arn,
      desiredCount: desiredTasks,
      launchType: "FARGATE",
      networkConfiguration: {
        subnets: privateSubnets,
        securityGroups: [ecsSg.id],
        assignPublicIp: false,
      },
      loadBalancer: [
        {
          targetGroupArn: targetGroup.arn,
          containerName: "app",
          containerPort: containerPort,
        },
      ],
      dependsOn: [alb, targetGroup, ecsTaskDef],
    });

    //  Outputs
    new TerraformOutput(this, "albDnsName", { value: alb.dnsName });
    new TerraformOutput(this, "ecrRepoUrl", { value: ecrRepo.repositoryUrl });
    new TerraformOutput(this, "ecsClusterName", { value: ecsCluster.name });
    new TerraformOutput(this, "vpcUsed", { value: vpc.id });
  }
}

const app = new App();
new TvDevOpsStack(app, "tv-devops-stack");
app.synth();
