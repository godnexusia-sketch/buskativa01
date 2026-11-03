-- category rules grew (esportes, moda, automotivo and more keywords): clear so the worker backfill recomputes every row
UPDATE "products" SET "category" = NULL;
