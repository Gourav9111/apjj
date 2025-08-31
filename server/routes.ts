import type { Express } from "express";
import { createServer, type Server } from "http";
import { dbStorage as storage } from "./db-storage";
import session from "express-session";
import { 
  insertUserSchema, 
  insertLoanApplicationSchema, 
  insertDsaPartnerSchema, 
  insertLeadSchema, 
  insertContactQuerySchema 
} from "@shared/schema";

// Session middleware
function setupSession(app: Express) {
  app.use(session({
    secret: process.env.SESSION_SECRET || 'jsmf-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
}

// Auth middleware
function requireAuth(req: any, res: any, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireRole(role: string) {
  return (req: any, res: any, next: any) => {
    if (!req.session.userId || req.session.userRole !== role) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

declare module 'express-session' {
  interface SessionData {
    userId: string;
    userRole: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupSession(app);

  // Auth routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.authenticateUser(username, password);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;
      
      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          fullName: user.fullName,
          email: user.email 
        } 
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get('/api/auth/user', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        fullName: user.fullName,
        email: user.email 
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // User registration
  app.post('/api/users/register', async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(userData.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = await storage.createUser(userData);
      res.status(201).json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          fullName: user.fullName,
          email: user.email 
        } 
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ message: "Registration failed" });
    }
  });

  // Loan application routes
  app.post('/api/loan-applications', requireAuth, async (req, res) => {
    try {
      const applicationData = insertLoanApplicationSchema.parse(req.body);
      const application = await storage.createLoanApplication({
        ...applicationData,
        userId: req.session.userId!
      });
      
      // Create a lead for this application
      const user = await storage.getUser(req.session.userId!);
      if (user) {
        await storage.createLead({
          name: user.fullName,
          mobileNumber: user.mobileNumber,
          email: user.email,
          loanType: applicationData.loanType,
          amount: applicationData.amount || "0",
          city: user.city || "Bhopal",
          source: "application"
        });
      }
      
      res.status(201).json(application);
    } catch (error) {
      console.error("Application creation error:", error);
      res.status(400).json({ message: "Failed to create application" });
    }
  });

  app.get('/api/loan-applications', requireAuth, async (req, res) => {
    try {
      let applications;
      if (req.session.userRole === 'admin') {
        applications = await storage.getLoanApplications();
      } else if (req.session.userRole === 'dsa') {
        applications = await storage.getLoanApplicationsByDsa(req.session.userId!);
      } else {
        applications = await storage.getLoanApplicationsByUser(req.session.userId!);
      }
      res.json(applications);
    } catch (error) {
      res.status(500).json({ message: "Failed to get applications" });
    }
  });

  app.patch('/api/loan-applications/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const application = await storage.updateLoanApplication(id, updates);
      res.json(application);
    } catch (error) {
      res.status(400).json({ message: "Failed to update application" });
    }
  });

  // DSA partner routes
  app.post('/api/dsa-partners', async (req, res) => {
    try {
      const { userData, partnerData } = req.body;
      
      // Create user first
      const userInput = { ...userData, role: "dsa" };
      const parsedUserData = insertUserSchema.parse(userInput);
      const user = await storage.createUser(parsedUserData);
      
      // Create DSA partner profile
      const parsedPartnerData = insertDsaPartnerSchema.parse(partnerData);
      const partner = await storage.createDsaPartner({
        ...parsedPartnerData,
        userId: user.id
      });
      
      res.status(201).json({ user, partner });
    } catch (error) {
      console.error("DSA registration error:", error);
      res.status(400).json({ message: "DSA registration failed" });
    }
  });

  app.get('/api/dsa-partners', requireRole('admin'), async (req, res) => {
    try {
      const partners = await storage.getDsaPartners();
      res.json(partners);
    } catch (error) {
      res.status(500).json({ message: "Failed to get DSA partners" });
    }
  });

  app.get('/api/dsa-partners/profile', requireRole('dsa'), async (req, res) => {
    try {
      const partner = await storage.getDsaPartnerByUserId(req.session.userId!);
      res.json(partner);
    } catch (error) {
      res.status(500).json({ message: "Failed to get DSA profile" });
    }
  });

  // Lead management routes
  app.post('/api/leads', async (req, res) => {
    try {
      const leadData = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(leadData);
      res.status(201).json(lead);
    } catch (error) {
      console.error("Lead creation error:", error);
      res.status(400).json({ message: "Failed to create lead" });
    }
  });

  app.get('/api/leads', requireAuth, async (req, res) => {
    try {
      let leads;
      if (req.session.userRole === 'admin') {
        leads = await storage.getLeads();
      } else if (req.session.userRole === 'dsa') {
        leads = await storage.getLeadsByDsa(req.session.userId!);
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(leads);
    } catch (error) {
      res.status(500).json({ message: "Failed to get leads" });
    }
  });

  app.patch('/api/leads/:id/assign', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { dsaId } = req.body;
      const lead = await storage.assignLeadToDsa(id, dsaId);
      res.json(lead);
    } catch (error) {
      res.status(400).json({ message: "Failed to assign lead" });
    }
  });

  app.patch('/api/leads/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const lead = await storage.updateLead(id, updates);
      res.json(lead);
    } catch (error) {
      res.status(400).json({ message: "Failed to update lead" });
    }
  });

  // Contact queries
  app.post('/api/contact-queries', async (req, res) => {
    try {
      const queryData = insertContactQuerySchema.parse(req.body);
      const query = await storage.createContactQuery(queryData);
      res.status(201).json(query);
    } catch (error) {
      console.error("Contact query error:", error);
      res.status(400).json({ message: "Failed to submit query" });
    }
  });

  app.get('/api/contact-queries', requireRole('admin'), async (req, res) => {
    try {
      const queries = await storage.getContactQueries();
      res.json(queries);
    } catch (error) {
      res.status(500).json({ message: "Failed to get contact queries" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
