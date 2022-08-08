import { CloudFormationCustomResourceEvent } from "aws-lambda";
import { Construct } from "constructs";
import { $AWS, Function } from "functionless";

export type CustomResourceMigrationsRunnerProps = {
  migrationFiles: string[];
};

export default class CustomResourceMigrationsRunner extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: CustomResourceMigrationsRunnerProps
  ) {
    super(scope, id);

    new Function(
      scope,
      `${id}-MigrationsRunner`,
      async (event: CloudFormationCustomResourceEvent) => {
        console.log(event);

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
      }
    );
  }
}
