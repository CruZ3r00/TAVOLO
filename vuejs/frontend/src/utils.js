export const colorCalculator = ( theme, primary_color, second_color, backgroud, details ) => {
    switch (theme.value){
        case 'Classico':
            backgroud.value = '#FFFFFF';
            primary_color.value = '#1C1C1C';
            second_color.value = '#3E2C1C';
            details.value = '#FFFFFF';
            break;
        case 'Luxury':
            backgroud.value = '#F9F6F1';
            primary_color.value = '#BFA980';
            second_color.value = '#3A3A3A';
            details.value = '#1B1B1B';
            break;
        case 'Street food' :
            backgroud.value = '#FFF8F0';
            primary_color.value = '#FF5722';
            second_color.value = '#FFE0B2';
            details.value = '#2B2B2B';
            break;
        case 'Minimal' :
            backgroud.value = '#F4F4F4';
            primary_color.value = '#007BFF';
            second_color.value = '#E8F0FE';
            details.value = '#202020';
            break;
        case 'Nature':
            backgroud.value = '#F7FFF7';
            primary_color.value = '#4CAF50';
            second_color.value = '#DCEDC8';
            details.value = '#2D2D2D';
            break;
        case 'Rustico':
            backgroud.value = '#FAF3E0';
            primary_color.value = '#8D6E63';
            second_color.value = '#FFF3E0';
            details.value = '#3E3E3E';
            break;
        case 'Pop':
            backgroud.value = '#FFFFFF';
            primary_color.value = '#FF4081';
            second_color.value = '#E1F5FE';
            details.value = '#212121';
            break;
        case 'Classico scuro':
            backgroud.value = '#101010';
            primary_color.value = '#FFFFFF';
            second_color.value = '#2C2C2C';
            details.value = '#F0F0F0';
            break;
        case 'Luxury scuro':
            backgroud.value = '#121212';
            primary_color.value = '#D4AF37';
            second_color.value = '#2E2E2E';
            details.value = '#F5F5F5';
            break;
        case 'Street food scuro':
            backgroud.value = '#1B1B1B';
            primary_color.value = '#FF7043';
            second_color.value = '#3E2C1C';
            details.value = '#FFFFFF';
            break;
        case 'Minimal scuro':
            backgroud.value = '#1E1E1E';
            primary_color.value = '#4DA6FF';
            second_color.value = '#2A2A2A';
            details.value = '#E0E0E0';
            break;
        case 'Nature scuro':
            backgroud.value = '#102015';
            primary_color.value = '#81C784';
            second_color.value = '#264D2C';
            details.value = '#E5FFE5';
            break;
        case 'Rustico scuro':
            backgroud.value = '#2D1F16';
            primary_color.value = '#A1887F';
            second_color.value = '#4E342E';
            details.value = '#F7F0E8';
            break;
        case 'Pop scuro':   
            backgroud.value = '#1C1C2B';
            primary_color.value = '#FF80AB';
            second_color.value = '#283593';
            details.value = '#FAFAFA';
            break;
    }
};

import qs from 'qs';

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
        const fetchuser = await fetch(`http://localhost:1337/api/users?${query}`,{
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
            const response = await fetch(`http://localhost:1337/api/menus?${query}`,{
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
        console.log(error);
    }
}