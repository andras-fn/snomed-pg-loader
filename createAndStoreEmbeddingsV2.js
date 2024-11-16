import fs from "node:fs";
import path from "path";
import { createClient } from "@libsql/client";
import { pipeline } from "@huggingface/transformers";
import { randomUUID } from "crypto";
import readline from "readline";
import { fileURLToPath } from "url";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to the TSV files and the SQLite database
const descriptionsTsvPath = path.join(__dirname, "descriptions.tsv");
const extendedMapTsvPath = path.join(__dirname, "extended_map.tsv");
const sqliteDbPath = path.join(__dirname, "local.db");

// Function to read and parse the TSV file
async function parseTSV(filePath) {
  const results = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const values = line.split("\t");
    results.push(values);
  }

  return results;
}

async function main() {
  // Delete the existing database if it exists
  try {
    fs.unlinkSync(sqliteDbPath);
    console.log("Existing database deleted.");
  } catch (error) {
    console.log("No existing database to delete.");
  }

  // Create the database client
  const db = createClient({
    url: `file:${sqliteDbPath}`,
  });

  // Create tables for descriptions and extended_map
  console.log("Creating tables...");
  await db.execute(`
    CREATE TABLE descriptions (
      conceptId TEXT,
      term TEXT,
      typeId TEXT,
      languageCode TEXT,
      active BOOLEAN
    )
  `);

  await db.execute(`
    CREATE TABLE extended_map (
      referencedComponentId TEXT,
      mapTarget TEXT,
      active BOOLEAN
    )
  `);

  // Insert data into descriptions table
  console.log("Parsing descriptions TSV...");
  const descriptionsData = await parseTSV(descriptionsTsvPath);
  console.log(`Parsed ${descriptionsData.length} rows from descriptions TSV.`);

  console.log("Inserting data into descriptions table...");
  for (const [index, row] of descriptionsData.entries()) {
    const [conceptId, term, typeId, languageCode, active] = row;
    await db.execute(
      "INSERT INTO descriptions (conceptId, term, typeId, languageCode, active) VALUES (?, ?, ?, ?, ?)",
      [conceptId, term, typeId, languageCode, active]
    );
    if ((index + 1) % 100 === 0) {
      console.log(`Inserted ${index + 1} rows into descriptions table...`);
    }
  }

  // Insert data into extended_map table
  console.log("Parsing extended_map TSV...");
  const extendedMapData = await parseTSV(extendedMapTsvPath);
  console.log(`Parsed ${extendedMapData.length} rows from extended_map TSV.`);

  console.log("Inserting data into extended_map table...");
  for (const [index, row] of extendedMapData.entries()) {
    const [referencedComponentId, mapTarget, active] = row;
    await db.execute(
      "INSERT INTO extended_map (referencedComponentId, mapTarget, active) VALUES (?, ?, ?)",
      [referencedComponentId, mapTarget, active]
    );
    if ((index + 1) % 100 === 0) {
      console.log(`Inserted ${index + 1} rows into extended_map table...`);
    }
  }

  // Create the table for storing embeddings
  console.log("Creating embeddings table...");
  await db.execute(`
    CREATE TABLE snomed_embeddings (
      id TEXT PRIMARY KEY,
      conceptId TEXT,
      term TEXT,
      embedding F32_BLOB(384)
    )
  `);

  // Create an index for the embeddings
  console.log("Creating index...");
  await db.execute(`
    CREATE INDEX snomed_embeddings_idx ON snomed_embeddings (libsql_vector_idx(embedding, 'metric=cosine'))
  `);

  // Initialize the transformer pipeline
  console.log("Initializing transformer pipeline...");
  const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  // Function to generate embeddings and insert into the database
  async function generateEmbeddingsAndInsert() {
    console.log("Generating embeddings and inserting into the database...");
    for (const [index, row] of descriptionsData.entries()) {
      const [conceptId, term] = row;

      // Generate a unique identifier for each record using the crypto package
      const recordId = randomUUID();

      // Generate the embedding for the term
      console.log(`Generating embedding for conceptId: ${conceptId}`);
      const embedding = await pipe(term, {
        pooling: "mean",
        normalize: true,
      });

      // Insert the data into the SQLite database
      const sql = `
        INSERT INTO snomed_embeddings (id, conceptId, term, embedding)
        VALUES (?, ?, ?, vector(?))
      `;
      const params = [recordId, conceptId, term, `[${embedding.data}]`];
      await db.execute(sql, params);

      if ((index + 1) % 10 === 0) {
        console.log(
          `Inserted ${index + 1} rows into snomed_embeddings table...`
        );
      }
    }
  }

  // Generate embeddings and insert the data
  await generateEmbeddingsAndInsert();

  console.log(
    "Embeddings generated and stored in the SQLite database successfully."
  );
}

// Run the main function
main().catch((error) => {
  console.error("Error:", error);
});
