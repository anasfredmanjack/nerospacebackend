import { Router } from "express";
import { NeroGigsController } from "./nerogigs.controller";
import { NeroGigsService } from "./nerogigs.service";

export class NerogigsModule {
  constructor(private readonly router: Router) {
    new NeroGigsController(new NeroGigsService(), router).init();
  }
}
