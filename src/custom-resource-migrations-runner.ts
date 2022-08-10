import {
  ExecutionStatus,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from "aws-lambda";
import { Construct } from "constructs";
import { $AWS, Function, Table } from "functionless";
import sortBy from "lodash.sortby";
import { marshall } from "typesafe-dynamodb/lib/marshall";
import { MigrationHistoryItem } from "./migrations-manager";

type MigrationIdStateMachineArnPair = {
  migrationId: string;
  stateMachineArn: string;
};

export type CustomResourceMigrationsRunnerProps = {
  migrationIdStateMachinePairs: MigrationIdStateMachineArnPair[];
  migrationsHistoryTable: Table<MigrationHistoryItem, "id">;
};

export default class CustomResourceMigrationsRunner extends Construct {
  public readonly function: Function<
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceResponse
  >;
  constructor(
    scope: Construct,
    id: string,
    {
      migrationsHistoryTable,
      migrationIdStateMachinePairs,
    }: CustomResourceMigrationsRunnerProps
  ) {
    super(scope, id);

    this.function = new Function(
      scope,
      `${id}-MigrationsRunner`,
      async (
        event: CloudFormationCustomResourceEvent
      ): Promise<CloudFormationCustomResourceResponse> => {
        console.log(event);

        const client = new SFNClient({});

        try {
          const storedMigrations = await $AWS.DynamoDB.Scan({
            Table: migrationsHistoryTable,
          });

          console.log({ storedMigrations, migrationIdStateMachinePairs });

          const migrationsToRun = sortBy(
            migrationIdStateMachinePairs.filter(
              (migrationStateMachinePair) =>
                !(storedMigrations.Items ?? []).find(
                  (storedMigration) =>
                    storedMigration.id.S ===
                    migrationStateMachinePair.migrationId
                )
            ),
            // migrationID starts with date
            "migrationId"
          );

          // Run migrations sequentially
          for (const migration of migrationsToRun) {
            // todo: Depending on the cloudformation transition (success/rollback) we could either use Up or Down state machine
            const command = new StartExecutionCommand({
              stateMachineArn: migration.stateMachineArn,
            });
            const response = await client.send(command);

            console.log({ migration, response });

            await $AWS.DynamoDB.PutItem({
              Table: migrationsHistoryTable,
              Item: marshall({
                id: migration.migrationId,
                status: "RUNNING" as ExecutionStatus,
                startedAt: response.startDate?.toISOString()!,
                executionArn: response.executionArn!,
              }),
            });
          }

          return {
            Status: "SUCCESS",
            LogicalResourceId: event.LogicalResourceId,
            PhysicalResourceId: "DYNAMODB_MIGRATIONS_MANAGER",
            StackId: event.StackId,
            RequestId: event.RequestId,
          };
        } catch (error) {
          console.error({ error });

          return {
            Status: "FAILED",
            Reason: (error as Error).message,
            LogicalResourceId: event.LogicalResourceId,
            PhysicalResourceId: "DYNAMODB_MIGRATIONS_MANAGER",
            StackId: event.StackId,
            RequestId: event.RequestId,
          };
        }
      }
    );

    // Allow custom resource to start execution of the migrations state machine
    this.function.resource.addToRolePolicy(
      new PolicyStatement({
        actions: ["states:StartExecution"],
        resources: migrationIdStateMachinePairs.map((m) => m.stateMachineArn),
      })
    );
  }
}
