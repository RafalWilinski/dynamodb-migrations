import { Table as cdkTable } from "aws-cdk-lib/aws-dynamodb";
import { $AWS, Table } from "functionless";
import { unmarshall, marshall } from "typesafe-dynamodb/lib/marshall";
import { Migration, MigrationFunction } from "../..";

const tableArn =
  "arn:aws:dynamodb:us-east-1:085108115628:table/TestStack-TableCD117FA1-ZVV3ZWUOWPO";

export const migration: MigrationFunction = (scope, migrationName) => {
  const migrationDefinition = new Migration<any>(scope, migrationName, {
    tableArn,
    migrationName,
  });

  const table = Table.fromTable(
    cdkTable.fromTableArn(scope, "TargetTable", tableArn)
  );

  // Actual migration code goes here.
  // For each item in the table
  migrationDefinition.scan(async ({ result }) => {
    for (const i of result.Items as any[]) {
      // Do the following
      await $AWS.DynamoDB.PutItem({
        Table: table,
        // Add migratedAt attribute to the item
        Item: marshall({ ...unmarshall(i), migratedAt: Date.now() }),
      });
    }
  });

  return migrationDefinition;
};
