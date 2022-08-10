import {
  DescribeExecutionCommand,
  ExecutionStatus,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { CloudFormationCustomResourceEvent } from "aws-lambda";
import { Construct } from "constructs";
import { $AWS, Function, Table } from "functionless";
import { marshall } from "typesafe-dynamodb/lib/marshall";
import { MigrationHistoryItem } from "./migrations-manager";

type MigrationIdStateMachineArnPair = {
  migrationId: string;
  stateMachineArn: string;
};

export type CustomResourceIsMigrationCompleteCheckerProps = {
  migrationIdStateMachinePairs: MigrationIdStateMachineArnPair[];
  migrationsHistoryTable: Table<MigrationHistoryItem, "id">;
};

export type ReturnType = { IsComplete: boolean };

export default class CustomResourceIsMigrationCompleteChecker extends Construct {
  public readonly function: Function<
    CloudFormationCustomResourceEvent,
    ReturnType
  >;
  constructor(
    scope: Construct,
    id: string,
    {
      migrationsHistoryTable,
      migrationIdStateMachinePairs,
    }: CustomResourceIsMigrationCompleteCheckerProps
  ) {
    super(scope, id);

    let allDone = true;

    this.function = new Function(
      scope,
      `${id}-MigrationsChecker`,
      async (event: CloudFormationCustomResourceEvent): Promise<ReturnType> => {
        console.log(event);

        const client = new SFNClient({});

        for (const migration of migrationIdStateMachinePairs) {
          const migrationEntry = await $AWS.DynamoDB.GetItem({
            Table: migrationsHistoryTable,
            Key: marshall({ id: migration.migrationId }),
          });

          if (!migrationEntry.Item) {
            throw new Error(
              `Failed to find migration entry for migrationId: ${migration.migrationId}`
            );
          }

          const command = new DescribeExecutionCommand({
            executionArn: migrationEntry.Item?.executionArn.S,
          });
          const response = await client.send(command);

          console.log({ migration, response });

          if (response.status === "RUNNING") {
            allDone = false;
          }

          await $AWS.DynamoDB.PutItem({
            Table: migrationsHistoryTable,
            Item: marshall({
              id: migration.migrationId,
              startedAt: response.startDate?.toISOString()!,
              executionArn: response.executionArn!,
              status: response.status as ExecutionStatus,
              endedAt: response.stopDate?.toISOString(),
            }),
          });
        }

        return { IsComplete: allDone };
      }
    );
  }
}
