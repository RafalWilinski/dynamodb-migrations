import { Table as cdkTable } from "aws-cdk-lib/aws-dynamodb";
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
  CloudFormationCustomResourceSuccessResponse,
  CloudFormationCustomResourceFailedResponse,
} from "aws-lambda";
import { Construct } from "constructs";
import { $AWS, Function, Table } from "functionless";
import { MigrationHistoryItem } from "./migrations-manager";

export type CustomResourceMigrationsRunnerProps = {
  migrationFiles: string[];
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
    props: CustomResourceMigrationsRunnerProps
  ) {
    super(scope, id);

    const migrationsHistoryTable = Table.fromTable<MigrationHistoryItem, "id">(
      cdkTable.fromTableArn(
        scope,
        "MigrationsHistoryTable",
        props.migrationsHistoryTable.tableArn
      )
    );

    this.function = new Function(
      scope,
      `${id}-MigrationsRunner`,
      async (event: CloudFormationCustomResourceEvent) => {
        console.log(event);

        try {
          const migrations = await $AWS.DynamoDB.Scan({
            Table: migrationsHistoryTable,
          });

          console.log({ migrations });

          const migrationsToRun = props.migrationFiles.filter(
            (migrationFile) =>
              !(migrations.Items ?? []).find(
                (migration) => migration.id.S === migrationFile
              )
          );

          console.log({ migrationsToRun });

          // todo: Start the migrations

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
