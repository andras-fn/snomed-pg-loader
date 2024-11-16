import fs from "node:fs";
import { createClient } from "@libsql/client";
import { pipeline } from "@huggingface/transformers";
import { randomUUID } from "crypto";

async function main() {
  // Paths to the input JSON file and the SQLite database
  const jsonFilePath = "snomed_icd_mapping.json";
  const sqliteDbPath = "local.db";

  // Load the JSON data
  const data = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));

  // Delete the existing database if it exists
  try {
    fs.unlinkSync(sqliteDbPath);
  } catch (error) {
    console.log("No db to delete");
  }

  // Create the database client
  const db = createClient({
    url: `file:${sqliteDbPath}`,
  });

  // Create the table for storing embeddings
  console.log("Creating table");
  await db.execute(`
    CREATE TABLE snomed_embeddings (
      id TEXT PRIMARY KEY,
      conceptId TEXT,
      snomed_term TEXT,
      icd_code TEXT,
      is_preferred_term TEXT,
      embedding F32_BLOB(384)
    )
  `);

  // Create an index for the embeddings
  console.log("Creating index");
  await db.execute(`
    CREATE INDEX snomed_embeddings_idx ON snomed_embeddings (libsql_vector_idx(embedding, 'metric=cosine'))
  `);

  // Initialize the transformer pipeline
  const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  // Function to generate embeddings and insert into the database
  async function processAndInsertData(data) {
    for (const entry of data) {
      const {
        conceptid: conceptId,
        snomed_term: snomedTerm,
        icd_code: icdCode,
        is_preferred_term: isPreferredTerm,
      } = entry;

      // Generate a unique identifier for each record using the crypto package
      const recordId = randomUUID();

      // Generate the embedding for the SNOMED term
      console.log(`Generating embedding for conceptId: ${conceptId}`);
      const embedding = await pipe(snomedTerm, {
        pooling: "mean",
        normalize: true,
      });

      // Insert the data into the SQLite database
      const sql = `
        INSERT INTO snomed_embeddings (id, conceptId, snomed_term, icd_code, is_preferred_term, embedding)
        VALUES (?, ?, ?, ?, ?, vector(?))
      `;
      const params = [
        recordId,
        conceptId,
        snomedTerm,
        icdCode,
        isPreferredTerm,
        `[${embedding.data}]`,
      ];
      await db.execute(sql, params);

      console.log(`Inserted conceptId: ${conceptId}`);
    }
  }

  // Process and insert the data
  await processAndInsertData(data);

  console.log(
    "Embeddings generated and stored in the SQLite database successfully."
  );
}

// Run the main function
main().catch((error) => {
  console.error("Error:", error);
});
