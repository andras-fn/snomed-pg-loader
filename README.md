## Load the TRUD Dataset into a PostgreSQL Database

### Steps to Load the Dataset

1. **Download the Dataset**
   - Obtain the dataset from the NHS TRUD website.

2. **Unzip the Dataset**
   - Extract the contents of the downloaded zip file.

3. **Configure Database Connection**
   - Fill in the database connection details in your configuration file or script.

4. **Run the Loader Script**
   - Execute the loader script with the path to the unzipped dataset:
     ```bash
     node loadSnomed.js "C:\\path\\to\\folder\\containing\\unzipped\\dataset\\uk_sct2mo_39.1.0_20241023000001Z\\SnomedCT_MonolithRF2_PRODUCTION_20241023T120000Z"
     ```

### Query Examples

#### Search Using an ICD-10 Code

```sql
-- Step 1: Search for SNOMED concepts based on the ICD-10 code
WITH ConceptMatches AS (
  SELECT referencedComponentId AS conceptId
  FROM extended_map
  WHERE mapTarget = 'O103' -- Replace 'O103' with the actual ICD-10 code you are searching for
    AND active = true
)

-- Step 2: Retrieve the preferred SNOMED term for the identified concepts
SELECT cm.conceptId, td.term AS snomed_term
FROM ConceptMatches cm
JOIN descriptions td ON cm.conceptId = td.conceptId
WHERE td.active = true
  AND td.languageCode = 'en' -- Assuming we are looking for English descriptions
  AND td.typeId = '900000000000003001'; -- Assuming this is the typeId for preferred terms
```

#### Search Based on a SNOMED Description
```sql
-- Step 1: Search for a SNOMED description and identify the concept
WITH ConceptMatches AS (
  SELECT conceptId
  FROM descriptions
  WHERE term LIKE '%primary%hypertension%'
    AND active = true
)

-- Step 2: Retrieve the associated ICD codes for the identified concept
SELECT cm.conceptId, td.term AS snomed_term, em.mapTarget AS icd_code
FROM ConceptMatches cm
JOIN descriptions td ON cm.conceptId = td.conceptId
JOIN extended_map em ON cm.conceptId = em.referencedComponentId
WHERE td.active = true
  AND td.languageCode = 'en' -- Assuming we are looking for English descriptions
  AND em.active = true; -- Only include active mappings
  ```