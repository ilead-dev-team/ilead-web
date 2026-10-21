import { curriculumLevels } from "../../src/lib/curriculum";

// Explicit test data matching the backend's fixed three-level, 48-lesson contract.
export function curriculumFixture(title = "Leadership") {
  return {
    data: {
      levels: curriculumLevels.map((level) => ({
        ...level,
        lessons: Array.from({ length: 16 }, (_, index) => ({
          id: `${level.key}-${index + 1}`,
          number: index + 1,
          title:
            index === 0 && level.key === "ICHOOSE"
              ? title
              : `${level.label} lesson ${index + 1}`,
        })),
      })),
    },
  };
}
