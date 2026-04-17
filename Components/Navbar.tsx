import {Box} from "lucide-react";
import Button from "./ui/Button";

import {useOutletContext} from "react-router";

const Navbar=()=>{
    const {isSignedIn, userName, signIn, signOut }=useOutletContext<AuthContext>();
    const handleAuthClick=async () =>{
        if (isSignedIn){
            try{
                await signOut();
            }catch(e){
                console.error(`puter signed out failed: ${e}`);
            }
            return;
        }

        try{
            await signIn();
        }catch(e){
            console.error(`puter signed in failed: ${e}`);
        }
    };
    return (
        <header className="navbar">
            <nav className="inner">
                <div className="left">
                <div className="brand">
                    <Box className="logo"/>
                    <span className="name">
                        Plan2Reality
                    </span>
                </div>
                    <ul className="links">
                        <a href="#">Product</a>
                        <a href="#">Pricing</a>
                        <a href="#">Community</a>
                        <a href="#">Entreprise</a>
                    </ul>
                </div>
                <div className="actions">
                    {
                        isSignedIn ?(
                            <>
                                <span  className="greeting">
                                    {userName ? `Hi ${userName}` : 'Signed In succesfully'}
                                </span>
                                <Button size="sm" onClick={handleAuthClick} className="btn">
                                    Logged Out
                                </Button>
                            </>
                        ):(
                            <>
                            <Button
                                onClick={handleAuthClick}
                                 size="sm" variant="ghost">
                                Log In
                            </Button>
                                <a href="#upload"
                                   className="cta"
                                >get started</a>
                            </>
                        )
                     }
                </div>
            </nav>
        </header>
    )
}
export default Navbar;
