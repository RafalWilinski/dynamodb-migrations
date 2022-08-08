// import { Table as cdkTable } from "aws-cdk-lib/aws-dynamodb";
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
  CloudFormationCustomResourceSuccessResponse,
  CloudFormationCustomResourceFailedResponse,
} from "aws-lambda";
import { Construct } from "constructs";
import { $AWS, Function, Table } from "functionless";
import { Migration } from "./migration";
import { MigrationHistoryItem } from "./migrations-manager";

export type CustomResourceMigrationsRunnerProps = {
  migrationFiles: string[];
  migrationStacks: Migration<any>[];
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
      migrationStacks,
    }: CustomResourceMigrationsRunnerProps
  ) {
    super(scope, id);

    // todo/ to think: maybe this can be a step function too?
    // I think it cannot because of custom resources provider - it requires a function
    this.function = new Function(
      scope,
      `${id}-MigrationsRunner`,
      async (event: CloudFormationCustomResourceEvent) => {
        console.log(event);

        try {
          const migrations = await $AWS.DynamoDB.Scan({
            Table: migrationsHistoryTable,
          });

          console.log({ migrations, migrationStacks });

          // todo: Ensure chronological order of migrations.
          const migrationsToRun = migrationStacks.filter(
            (migrationStack) =>
              !(migrations.Items ?? []).find(
                (migration) => migration.id.S === migrationStack.stackId
              )
          );

          console.log({ migrationsToRun });

          // todo: run in sequence actually
          if (migrationsToRun[0].stateMachine) {
            await migrationsToRun[0].stateMachine({});
            // todo: store migration state
            // todo: after finish, mark it as complete
            // todo: maybe isCompleteHandler should take care of it?
          }

          return {
            Status: "SUCCESS",
          } as CloudFormationCustomResourceSuccessResponse;
        } catch (error) {
          return {
            Status: "FAILED",
          } as CloudFormationCustomResourceFailedResponse;
        }
      }
    );
  }
}
