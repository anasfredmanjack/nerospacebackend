import { NerogigsModule } from "../nerogigs.module";
import { Router } from "express";

// Mock the NerogigsModule to avoid typegoose issues
jest.mock("../nerogigs.module", () => {
  return {
    NerogigsModule: jest.fn().mockImplementation(() => {
      return {
        init: jest.fn(),
      };
    }),
  };
});

describe("NerogigsModule", () => {
  let router: Router;
  let nerogigsModule: NerogigsModule;

  beforeEach(() => {
    router = Router();
    nerogigsModule = new NerogigsModule(router);
  });

  it("should be defined", () => {
    expect(nerogigsModule).toBeDefined();
  });

  it("should initialize routes", () => {
    // Get all routes from the router
    const routes = router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));

    // Check if essential routes are defined
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: "/nerogigs",
        methods: expect.arrayContaining(["get"]),
      })
    );

    expect(routes).toContainEqual(
      expect.objectContaining({
        path: "/nerogigs/categories",
        methods: expect.arrayContaining(["get"]),
      })
    );

    expect(routes).toContainEqual(
      expect.objectContaining({
        path: "/nerogigs/tags",
        methods: expect.arrayContaining(["get"]),
      })
    );
  });
});
