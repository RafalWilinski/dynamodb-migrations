import { Construct } from "constructs";
import { $AWS } from "functionless";
import { ScanOutput } from "typesafe-dynamodb/lib/scan";
import { Migration, MigrationProps } from "../../app";

export type MigrationFunction = (
  scope: Construct,
  id: string,
  props: MigrationProps
) => Migration<any>;

export const up: MigrationFunction = (scope, migrationName) =>
  // Initialize Migration Stack
  new Migration(scope, migrationName, {
    tableArn: "arn:aws:dynamodb:us-east-1:123456789012:table/SubjectTable",
  }).run(async (_table, result: ScanOutput<any, any, any>) => {
    // Actual migration code goes here.
    // Do something with each item in the table.
    for (const i of result.Items as any[]) {
      await $AWS.DynamoDB.PutItem({
        Table: _table,
        Item: {
          id: {
            S: `${i}_migrated`,
          },
        },
      });
    }
  });