import { NeroGigsService } from "./nerogigs.service";
import { Request, Response, Router } from "express";

export class NeroGigsController {
  constructor(
    private readonly nerogigsService: NeroGigsService,
    private readonly router: Router
  ) {}

  public init() {
    this.router.post("/nerogigs", async (req, res) => {
      console.log("create gig", req.body);
      const gig = await this.nerogigsService.create(req.body);
      res.status(201).json(gig);
    });

    this.router.get("/nerogigs/categories", async (req, res) => {
      const categories = await this.nerogigsService.findAllGigCategories();
      res.status(200).json(categories);
    });

    this.router.get("/nerogigs/tags", async (req, res) => {
      const tags = await this.nerogigsService.findAllGigTags();
      res.status(200).json(tags);
    });

    this.router.get("/nerogigs/categories/:category", async (req, res) => {
      const category = req.params.category;
      const gigs = await this.nerogigsService.findGigByCategory(category);
      res.status(200).json(gigs);
    });

    this.router.get("/nerogigs/tags/:tag", async (req, res) => {
      const tag = req.params.tag;
      const gigs = await this.nerogigsService.findGigByTag(tag);
      res.status(200).json(gigs);
    });

    this.router.get("/nerogigs/:id", async (req, res) => {
      const gig = await this.nerogigsService.findOne(req.params.id);
      res.status(200).json(gig);
    });

    this.router.get("/nerogigs", async (req, res) => {
      const gigs = await this.nerogigsService.findAll();
      res.status(200).json(gigs);
    });
  }
}
