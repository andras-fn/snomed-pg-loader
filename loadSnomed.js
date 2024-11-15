const { Client } = require("pg");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");

// PostgreSQL client configuration
const client = new Client({
  user: "postgres",
  host: "localhost",
  database: "snomed",
  password: "postgres",
  port: 5433,
});

async function createTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS concepts (
      id VARCHAR PRIMARY KEY,
      effectiveTime DATE,
      active BOOLEAN,
      moduleId VARCHAR,
      definitionStatusId VARCHAR
    )`,
    `CREATE TABLE IF NOT EXISTS descriptions (
      id VARCHAR PRIMARY KEY,
      effectiveTime DATE,
      active BOOLEAN,
      moduleId VARCHAR,
      conceptId VARCHAR,
      languageCode VARCHAR,
      typeId VARCHAR,
      term TEXT,
      caseSignificanceId VARCHAR
    )`,
    `CREATE TABLE IF NOT EXISTS extended_map (
      id VARCHAR PRIMARY KEY,
      effectiveTime DATE,
      active BOOLEAN,
      moduleId VARCHAR,
      refsetId VARCHAR,
      referencedComponentId VARCHAR,
      mapTarget VARCHAR,
      mapGroup INTEGER,
      mapPriority INTEGER,
      mapRule TEXT,
      mapAdvice TEXT,
      correlationId VARCHAR,
      mapBlock VARCHAR
    )`,
  ];

  for (const query of queries) {
    await client.query(query);
  }
}

async function loadCSV(filePath, tableName, columns) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const results = [];
    let rowCount = 0;

    stream
      .pipe(csv({ separator: "\t" })) // Specify tab as the delimiter
      .on("data", (data) => {
        const values = columns.map((col) =>
          data[col] !== undefined ? data[col] : null
        );
        if (values[0] !== null) {
          // Ensure 'id' is not null
          results.push(values);
        } else {
          console.warn(`Skipping row with null id: ${JSON.stringify(data)}`);
        }
        rowCount++;
        if (rowCount % 1000 === 0) {
          console.log(`Processed ${rowCount} rows from ${filePath}`);
        }
      })
      .on("end", async () => {
        if (results.length > 0) {
          const query = `INSERT INTO ${tableName} (${columns.join(
            ", "
          )}) VALUES `;
          const values = results
            .map(
              (row) =>
                `(${row
                  .map((val) =>
                    val !== null ? `'${val.replace(/'/g, "''")}'` : "NULL"
                  )
                  .join(", ")})`
            )
            .join(", ");
          await client.query(query + values);
        }
        console.log(`Finished loading ${rowCount} rows into ${tableName}`);
        resolve();
      })
      .on("error", reject);
  });
}

async function main() {
  try {
    await client.connect();
    await createTables();

    const datasetDir = path.join(process.argv[2] || __dirname, "Snapshot");
    const files = [
      {
        filePath: path.join(
          datasetDir,
          "Terminology",
          "sct2_Concept_MONOSnapshot_GB_20241023.txt"
        ),
        tableName: "concepts",
        columns: [
          "id",
          "effectiveTime",
          "active",
          "moduleId",
          "definitionStatusId",
        ],
      },
      {
        filePath: path.join(
          datasetDir,
          "Terminology",
          "sct2_Description_MONOSnapshot-en_GB_20241023.txt"
        ),
        tableName: "descriptions",
        columns: [
          "id",
          "effectiveTime",
          "active",
          "moduleId",
          "conceptId",
          "languageCode",
          "typeId",
          "term",
          "caseSignificanceId",
        ],
      },
      {
        filePath: path.join(
          datasetDir,
          "Refset",
          "Map",
          "der2_iisssciRefset_ExtendedMapMONOSnapshot_GB_20241023.txt"
        ),
        tableName: "extended_map",
        columns: [
          "id",
          "effectiveTime",
          "active",
          "moduleId",
          "refsetId",
          "referencedComponentId",
          "mapTarget",
          "mapGroup",
          "mapPriority",
          "mapRule",
          "mapAdvice",
          "correlationId",
          "mapBlock",
        ],
      },
    ];

    for (const file of files) {
      await loadCSV(file.filePath, file.tableName, file.columns);
    }

    console.log("Data loaded successfully");
  } catch (err) {
    console.error("Error loading data:", err);
  } finally {
    await client.end();
  }
}

main();
