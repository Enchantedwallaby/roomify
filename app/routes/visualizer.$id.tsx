import {useEffect, useState} from "react";
import {useParams} from "react-router";
import {loadUploadedImage} from "../../lib/upload-storage";

const VisualizerId=()=>{
    const {id} = useParams();
    const [imageData, setImageData] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!id) {
            setHasError(true);
            setImageData(null);
            return;
        }

        const storedImage = loadUploadedImage(id);

        if (!storedImage) {
            setHasError(true);
            setImageData(null);
            return;
        }

        setHasError(false);
        setImageData(storedImage);
    }, [id]);

    return(
        <div className="visualizer-route">
            <div className="visualizer">
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-meta">
                            <p>Visualizer</p>
                            <h2>{id ? `Upload ${id}` : "Missing Upload"}</h2>
                            <p className="note">
                                {hasError ? "The requested upload could not be loaded." : "Loaded from the latest uploaded floor plan."}
                            </p>
                        </div>
                    </div>
                    <div className="render-area">
                        {imageData ? (
                            <img src={imageData} alt="Uploaded floor plan" className="render-img"/>
                        ) : (
                            <div className="render-placeholder">
                                <p className="status-text">{hasError ? "Upload not found or corrupted." : "Loading..."}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default VisualizerId;
