## loads some of the trud dataset into a postgres database
 - download the dataset from nhs trud
 - unzip
 - fill in the db connection details
 - call it like:
    - node loadSnomed.js "C:\\path\\to\\folder\\containing\\unzipped\\dataset\\uk_sct2mo_39.1.0_20241023000001Z\\SnomedCT_MonolithRF2_PRODUCTION_20241023T120000Z"

you can then query it like in the following examples:

search using an icd10 code:
```bash
-- Step 1: Search for SNOMED concepts based on the ICD-10 code
WITH ConceptMatches AS (
  SELECT referencedComponentId AS conceptId
  FROM extended_map
  WHERE mapTarget = 'O103' -- Replace 'ICD10_CODE' with the actual ICD-10 code you are searching for
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

search based on a snomed description:
```bash
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