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
import { SecurityGroupRule } from "./.gen/providers/aws/security-group-rule";
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
import { CloudwatchMetricAlarm } from "./.gen/providers/aws/cloudwatch-metric-alarm";
// HTTPS / DNS imports — commented out until you’re ready
// import { AcmCertificate } from "./.gen/providers/aws/acm-certificate";
// import { AcmCertificateValidation } from "./.gen/providers/aws/acm-certificate-validation";
// import { Route53Record } from "./.gen/providers/aws/route53-record";
// import { DataAwsRoute53Zone } from "./.gen/providers/aws/data-aws-route53-zone";

import { S3Backend } from "cdktf";

// Validate env vars
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
  "PRIVATE_SUBNET_CIDR_B",
  // "DOMAIN_NAME",
  // "EXISTING_CERTIFICATE_ARN",
  "TF_STATE_BUCKET",
]);

class TvDevOpsStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // S3 backend configuration (keep your bucket manually created)
    new S3Backend(this, {
      bucket: process.env.TF_STATE_BUCKET!,
      key: "terraform.tfstate",
      region: process.env.AWS_REGION!,
      encrypt: true,
    });

    // Common tags
    const appClusterName = process.env.APP_CLUSTER_NAME!;
    const commonTags = {
      Project: "tv-devops",
      Environment: "production",
      ManagedBy: "cdktf",
      AppName: appClusterName,
      Owner: "devops-team",
      CostCenter: "it-1234",
    };

    // Load env
    const region = process.env.AWS_REGION!;
    const awsAccountId = process.env.AWS_ACCOUNT_ID!;
    const vpcCidr = process.env.CUSTOM_VPC_CIDR!;
    const pubCidrA = process.env.PUBLIC_SUBNET_CIDR_A!;
    const pubCidrB = process.env.PUBLIC_SUBNET_CIDR_B!;
    const privCidrA = process.env.PRIVATE_SUBNET_CIDR_A!;
    const privCidrB = process.env.PRIVATE_SUBNET_CIDR_B!;
    // const domainName = process.env.DOMAIN_NAME!;

    const appRepoName = process.env.APP_REPO_NAME!;
    const imageTag = process.env.APP_IMAGE_TAG || "latest";

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

    // VPC, IGW, Subnets, RTs, NAT, etc…
    const vpc = new Vpc(this, "customVpc", {
      cidrBlock: vpcCidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: { ...commonTags, Name: "tv-devops-vpc" },
    });

    const igw = new InternetGateway(this, "igw", {
      vpcId: vpc.id,
      tags: commonTags,
    });

    const publicSubnetA = new Subnet(this, "publicSubnetA", {
      vpcId: vpc.id,
      cidrBlock: pubCidrA,
      availabilityZone: azA,
      mapPublicIpOnLaunch: true,
      tags: { ...commonTags, Name: "public-subnet-a" },
    });

    const publicSubnetB = new Subnet(this, "publicSubnetB", {
      vpcId: vpc.id,
      cidrBlock: pubCidrB,
      availabilityZone: azB,
      mapPublicIpOnLaunch: true,
      tags: { ...commonTags, Name: "public-subnet-b" },
    });

    const publicRT = new RouteTable(this, "publicRT", {
      vpcId: vpc.id,
      tags: commonTags,
    });

    new Route(this, "publicInternetRoute", {
      routeTableId: publicRT.id,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: igw.id,
    });

    new RouteTableAssociation(this, "pubAssocA", {
      subnetId: publicSubnetA.id,
      routeTableId: publicRT.id,
    });

    new RouteTableAssociation(this, "pubAssocB", {
      subnetId: publicSubnetB.id,
      routeTableId: publicRT.id,
    });

    const natEip = new Eip(this, "natEip", {
      domain: "vpc",
      tags: commonTags,
    });

    const natGw = new NatGateway(this, "natGw", {
      allocationId: natEip.allocationId,
      subnetId: publicSubnetA.id,
      tags: commonTags,
    });

    const privateSubnetA = new Subnet(this, "privateSubnetA", {
      vpcId: vpc.id,
      cidrBlock: privCidrA,
      availabilityZone: azA,
      tags: { ...commonTags, Name: "private-subnet-a" },
    });

    const privateSubnetB = new Subnet(this, "privateSubnetB", {
      vpcId: vpc.id,
      cidrBlock: privCidrB,
      availabilityZone: azB,
      tags: { ...commonTags, Name: "private-subnet-b" },
    });

    const privateRT = new RouteTable(this, "privateRT", {
      vpcId: vpc.id,
      tags: commonTags,
    });

    new Route(this, "privateNatRoute", {
      routeTableId: privateRT.id,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: natGw.id,
    });

    new RouteTableAssociation(this, "privAssocA", {
      subnetId: privateSubnetA.id,
      routeTableId: privateRT.id,
    });

    new RouteTableAssociation(this, "privAssocB", {
      subnetId: privateSubnetB.id,
      routeTableId: privateRT.id,
    });

    const publicSubnets = [publicSubnetA.id, publicSubnetB.id];
    const privateSubnets = [privateSubnetA.id, privateSubnetB.id];

    // ECS Cluster + SGs + ECR + ALB + TG
    const ecsCluster = new EcsCluster(this, "ecsCluster", {
      name: appClusterName,
      tags: commonTags,
    });

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
      tags: commonTags,
    });

    const ecsSg = new SecurityGroup(this, "ecsSg", {
      name: "ecs-tasks-sg",
      description: "Allow only ALB to ECS traffic",
      vpcId: vpc.id,
      ingress: [],
      egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: sgEgressCidrs }],
      tags: commonTags,
    });

    new SecurityGroupRule(this, "albToEcsRule", {
      type: "egress",
      fromPort: containerPort,
      toPort: containerPort,
      protocol: "tcp",
      securityGroupId: albSg.id,
      sourceSecurityGroupId: ecsSg.id,
    });

    new SecurityGroupRule(this, "ecsFromAlbRule", {
      type: "ingress",
      fromPort: containerPort,
      toPort: containerPort,
      protocol: "tcp",
      securityGroupId: ecsSg.id,
      sourceSecurityGroupId: albSg.id,
    });

    const ecrRepo = new EcrRepository(this, "appRepo", {
      name: appRepoName,
      tags: commonTags,
    });

    const alb = new Lb(this, "alb", {
      name: "tv-devops-alb",
      loadBalancerType: "application",
      subnets: publicSubnets,
      securityGroups: [albSg.id],
      tags: commonTags,
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
      tags: commonTags,
    });

    // HTTP listener only:
    new LbListener(this, "httpListener", {
      loadBalancerArn: alb.arn,
      port: 80,
      protocol: "HTTP",
      defaultAction: [{ type: "forward", targetGroupArn: targetGroup.arn }],
      tags: commonTags,
    });

    // HTTPS listener & DNS → commented out until ENABLE_HTTPS = true
    /*
    const enableHttps = process.env.ENABLE_HTTPS === "true";
    if (enableHttps) {
      // look up existing hosted zone:
      const hostedZone = new DataAwsRoute53Zone(this, "hostedZone", {
        name: domainName,
      });

      // issue or reuse certificate:
      let certificateArn = process.env.EXISTING_CERTIFICATE_ARN!;
      if (!certificateArn) {
        const cert = new AcmCertificate(this, "certificate", {
          domainName: `app.${domainName}`,
          subjectAlternativeNames: [`*.${domainName}`],
          validationMethod: "DNS",
        });
        const vo = cert.domainValidationOptions.get(0);
        if (vo) {
          new Route53Record(this, "certValidationRecord", {
            zoneId: hostedZone.zoneId,
            name: vo.resourceRecordName,
            type: vo.resourceRecordType,
            records: [vo.resourceRecordValue],
            ttl: 60,
          });
        }
        new AcmCertificateValidation(this, "certificateValidation", {
          certificateArn: cert.arn,
          validationRecordFqdns: vo ? [vo.resourceRecordName] : [],
        });
        certificateArn = cert.arn;
      }

      new LbListener(this, "httpsListener", {
        loadBalancerArn: alb.arn,
        port: 443,
        protocol: "HTTPS",
        certificateArn,
        defaultAction: [{ type: "forward", targetGroupArn: targetGroup.arn }],
        tags: commonTags,
      });
    }
    */

    // IAM, TaskDef, Service, CloudWatch logs + alarms…
    // (unchanged)

    const ecsTaskRole = new IamRole(this, "ecsTaskRole", {
      name: `ecsTaskRole-${appClusterName}`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ecs-tasks.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
      tags: commonTags,
    });

    new IamRolePolicyAttachment(this, "ecsTaskPolicyAttach", {
      role: ecsTaskRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    });

    const logGroup = new CloudwatchLogGroup(this, "ecsLogGroup", {
      name: `/ecs/${appClusterName}`,
      retentionInDays: logRetention,
      tags: commonTags,
    });

    new CloudwatchMetricAlarm(this, "highCpuAlarm", {
      alarmName: `${appClusterName}-high-cpu`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 2,
      metricName: "CPUUtilization",
      namespace: "AWS/ECS",
      period: 300,
      statistic: "Average",
      threshold: 80,
      dimensions: {
        ClusterName: ecsCluster.name,
        ServiceName: `${appClusterName}-service`,
      },
      alarmDescription: "Alarm when CPU exceeds 80%",
      tags: commonTags,
    });

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
          portMappings: [{ containerPort, hostPort: containerPort, protocol: "tcp" }],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroup.name,
              "awslogs-region": region,
              "awslogs-stream-prefix": "ecs",
            },
          },
        },
      ]),
      tags: commonTags,
    });

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
      loadBalancer: [{ targetGroupArn: targetGroup.arn, containerName: "app", containerPort }],
      dependsOn: [alb, targetGroup],
      tags: commonTags,
    });

    new TerraformOutput(this, "albDnsName", { value: alb.dnsName });
    // For now, appUrl can be HTTP:
    new TerraformOutput(this, "appUrl", { value: `http://${alb.dnsName}/health` });

    new TerraformOutput(this, "ecrRepoUrl", { value: ecrRepo.repositoryUrl });
    new TerraformOutput(this, "ecsClusterName", { value: ecsCluster.name });
    new TerraformOutput(this, "vpcId", { value: vpc.id });
  }
}

const app = new App();
new TvDevOpsStack(app, "tv-devops-stack");
app.synth();
