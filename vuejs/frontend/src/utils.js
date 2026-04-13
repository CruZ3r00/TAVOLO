import qs from 'qs';

/**
 * Recupera gli elementi del menu di un utente tramite il suo documentId.
 * Usa l'API standard di Strapi v5.
 */
export const fetchMenuElements = async (id) => {
    try {
        //creazione query standard di strapi v5
        const query = qs.stringify({
            filters: {
                documentId:{
                    $eq: id
                }
            },
            populate: "*",
        });
        const fetchuser = await fetch(`${API_BASE}/api/users?${query}`,{
            method: "GET",
            headers: {
                "Content-Type" : "application/json",
            },
        });
        if(fetchuser.ok){
            const d = await fetchuser.json();
            //creazione query standard di strapi v5
            const query = qs.stringify({
                filters: {
                    fk_user:{
                        id: {
                            $eq: d[0].id
                        },
                    }
                },
                populate: {
                    fk_elements: {
                        populate: ['image']
                    }
                }
            });
            const response = await fetch(`${API_BASE}/api/menus?${query}`,{
                method: 'GET',
                headers: {
                    "Content-Type": "application/json",
                }
            });
            if(response.ok){
                const data = await response.json();
                return data;
            }
        }
    } catch (error) {
        console.error(error);
    }
}

/**
 * Recupera il menu pubblico di un ristorante tramite la nuova API pubblica.
 * GET /api/menus/public/:userDocumentId
 */
export const fetchPublicMenu = async (userDocumentId) => {
    try {
        const response = await fetch(`${API_BASE}/api/menus/public/${userDocumentId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (response.ok) {
            const data = await response.json();
            return data;
        }
        return null;
    } catch (error) {
        console.error('Errore nel recupero del menu pubblico:', error);
        return null;
    }
};

/**
 * URL base delle API Strapi
 */
export const API_BASE = 'http://localhost:1337';
