import type { Route } from "./+types/home";
import Navbar from "../../Components/Navbar";
import {ArrowRight, ArrowUpRight, Clock, Layers} from "lucide-react";
import Button from "../../Components/ui/Button";
import Upload from "../../Components/upload";
import {useLocation, useNavigate, useOutletContext} from "react-router";
import {useCallback, useEffect, useRef, useState} from "react";
import {
  createProject,
  getProjects,
  PROJECTS_UPDATED_EVENT,
  syncRenderedProjectsToCommunity,
} from "../../lib/puter.action";

const formatProjectDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Plan2Reality" },
    { name: "description", content: "Visualize floor plans and explore community renders." },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn, userId } = useOutletContext<AuthContext>();
  const [projects, setProjects] = useState<DesignItem[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const isCreatingProjectRef = useRef(false);

  const loadCommunityProjects = useCallback(async () => {
    if (!isSignedIn || !userId) {
      setProjects([]);
      return;
    }

    setIsLoadingProjects(true);
    try {
      let items = await getProjects();

      if (items.length === 0) {
        await syncRenderedProjectsToCommunity();
        items = await getProjects();
      }

      setProjects(items);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (location.pathname === "/") {
      void loadCommunityProjects();
    }
  }, [loadCommunityProjects, location.pathname]);

  useEffect(() => {
    const handleProjectsUpdated = () => {
      if (location.pathname === "/") {
        void loadCommunityProjects();
      }
    };

    window.addEventListener(PROJECTS_UPDATED_EVENT, handleProjectsUpdated);
    return () => {
      window.removeEventListener(PROJECTS_UPDATED_EVENT, handleProjectsUpdated);
    };
  }, [loadCommunityProjects, location.pathname]);

  const handleUploadComplete = async (base64Image: string) => {
    try {
      if (isCreatingProjectRef.current) return false;
      isCreatingProjectRef.current = true;
      const newId = Date.now().toString();
      const name = `Residence ${newId}`;

      const newItem = {
        id: newId,
        name,
        sourceImage: base64Image,
        renderedImage: undefined,
        timestamp: Date.now(),
        ownerId: userId ?? null,
        isPublic: false,
      };

      const saved = await createProject({ item: newItem, visibility: "private" });

      if (!saved) {
        console.error("Failed to create project");
        return false;
      }

      navigate(`/visualizer/${newId}`, {
        state: {
          initialImage: saved.sourceImage,
          initialRendered: saved.renderedImage || null,
          name,
        },
      });

      return true;
    } finally {
      isCreatingProjectRef.current = false;
    }
  };

  return (
      <div className="home">
        <Navbar />

        <section className="hero">
          <div className="announce">
            <div className="dot">
              <div className="pulse"></div>
            </div>

            <p>Introducing Plan2Reality 2.0</p>
          </div>

          <h1>Build beautiful spaces at the speed of thought with Plan2Reality</h1>

          <p className="subtitle">
            Plan2Reality is an AI-first design environment that helps you visualize, render, and ship architectural projects faster than ever.
          </p>

          <div className="actions">
            <a href="#upload" className="cta">
              Start Building <ArrowRight className="icon" />
            </a>

            <Button variant="outline" size="lg" className="demo">
              Watch Demo
            </Button>
          </div>

          <div id="upload" className="upload-shell">
            <div className="grid-overlay" />

            <div className="upload-card">
              <div className="upload-head">
                <div className="upload-icon">
                  <Layers className="icon" />
                </div>

                <h3>Upload your floor plan</h3>
                <p>Supports JPG, PNG, formats up to 10MB</p>
              </div>

              <Upload onComplete={handleUploadComplete} />
            </div>
          </div>
        </section>

        <section className="projects">
          <div className="section-inner">
            <div className="section-head">
              <div className="copy">
                <h2>Projects</h2>
                <p>Your latest work and shared community projects, all in one place.</p>
              </div>
            </div>

            {!isSignedIn ? (
              <p className="projects-empty">Sign in to browse community renders and share your finished work.</p>
            ) : isLoadingProjects ? (
              <p className="projects-empty">Loading community projects...</p>
            ) : projects.length === 0 ? (
              <p className="projects-empty">
                No finished renders yet. Upload a floor plan and your final output will appear here for everyone signed in.
              </p>
            ) : (
              <div className="projects-grid">
                {projects.map(({ id, name, renderedImage, sourceImage, timestamp, ownerId, sharedBy }) => {
                  const isOwnProject = !!userId && ownerId === userId;

                  return (
                    <div
                      key={id}
                      className="project-card group"
                      onClick={() => navigate(`/visualizer/${id}`)}
                    >
                      <div className="preview">
                        <img src={renderedImage || sourceImage} alt={name || "Project"} />

                        <div className="badge">
                          <span>{isOwnProject ? "Yours" : "Community"}</span>
                        </div>
                      </div>

                      <div className="card-body">
                        <div>
                          <h3>{name}</h3>

                          <div className="meta">
                            <Clock size={12} />
                            <span>{formatProjectDate(timestamp)}</span>
                            <span>By {sharedBy || "Community member"}</span>
                          </div>
                        </div>
                        <div className="arrow">
                          <ArrowUpRight size={18} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
  );
}
