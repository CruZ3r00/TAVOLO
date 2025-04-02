<script setup> //Pagina in cui l'utente aggiunge gli elementi al menu
    import { onMounted, ref } from 'vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { useRouter } from 'vue-router';
    import qs from 'qs';

    //recupero del jwt della sessione in corso con store e reindirizzo il sito con il router
    const store = useStore();
    const router = useRouter();
    const tkn = store.getters.getToken;
    const usr = store.getters.getUser;


    //funzione che verifica lo stato dell'abbonamento dell'utente loggato
    const verifyPayment = async () => {
        try {
            const response = await fetch('http://localhost:1337/api/users/me',{
                method: "GET",
                headers: {
                    "Authorization" : `Bearer ${tkn}`,
                    "Content-Type" : "application/json",
                },
            });
            if(response.ok){ //momentaneamente && 0 per returnare sempre true
                const data = await response.json();
                if( data.payment_method == null && 0) router.push('/add-payment');
                else if ( new Date(data.end_subscription) < new Date() && 0 ) router.push('/renew-sub');
                else return true; 
            }
        } catch (error) {
            console.log(error);
        }
    };
    
    //variabili per il supporto delle richieste fetch
    const elementID = ref();
    const siteID = ref();
    const imagePreview = ref(null);
    const uploadedImageId = ref(null);

    //variabili utilizzate nel form da inviare per la richiesta API per creare nuovi record
    const name = ref('');
    const ingredients = ref('');
    const allergens = ref('');
    const image = ref(null);
    const price = ref(null);
    const category = ref('');

    //caricamento delle immagini su strapi
    const uploadImage = async () => {
        if(!image.value) return

        const formData = new FormData();
        formData.append('files', image.value);
        try {
            const response = await fetch('http://localhost:1337/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tkn}`,
                },
                body: formData,
            });
            
            const result = await response.json();
            if( result && result[0]){
                uploadedImageId.value = result[0].id;
            }
        } catch (error) {
            console.log(error);
        }
    };

    //Creazione di un nuovo record di elemento tramite API strapi 
    const CreateElement = async () => {
        try{
            const response = await fetch('http://localhost:1337/api/elements',{
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
                body: JSON.stringify({
                    data: {
                        name: name.value,
                        ingredients: ingredients.value,
                        allergens: allergens.value,
                        image: uploadedImageId.value,
                        price: price.value,
                        category: category.value,
                    }
                })
            });

            if (response.ok){
                const data = await response.json();
                elementID.value = data.data.id-1;
                console.log(elementID.value);
            }

        }catch( error ){
            console.log(error);
        }
    };

    const FetchSite = async () => {
        const query = qs.stringify({
            filters: {
                user_id:{
                    $eq: usr.id,
                }
            }
        })
        try{
            const response = await fetch(`http://localhost:1337/api/sites?${query}`,{
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
            });

            if (response.ok){
                const data = await response.json();
                siteID.value = data.data[0].id-1;
                console.log(siteID.value)
            }

        }catch( error ){
            console.log(error);
        }
    };

    //funzione quando si fa il submit del form che gestisce le altre funzioni e la richiesta finale
    const submit = async () => {
        const id = Number(siteID.value);
        console.log(id);
        const query = qs.stringify({
            filters: {
                fk_site:{
                    $eq: id,
                }
            },
            populate: "*",
        })
        try {
            await uploadImage();
            await CreateElement();
            const response =  await fetch(`http://localhost:1337/api/menus?${query}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                },
            });
            if (response.ok){
                const data = await response.json();
                console.log(data);
                if(data.data.length <= 0){
                    const r = await fetch(`http://localhost:1337/api/menus`,{
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                        },
                        body: JSON.stringify({
                            data: {
                                fk_site: siteID.value,
                                fk_elements: elementID.value,
                            }
                        })
                    });
                }else{
                    const first = data.data[0].id;
                    const update = await fetch(`http://localhost:1337/api/menus?${first}`,{
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${tkn}`, // Se l'API è protetta
                        },
                        body: JSON.stringify({
                            data: {
                                fk_elements: elementID.value,
                            }
                        })
                    });
                }
            }
        } catch (error) {
            console.log(error);
        }
    };

    const handleFile = (event) => {
        const file = event.target.files[0];
        if ( file ){
            image.value = file;
            // Mostra un'anteprima dell'immagine
            const reader = new FileReader();
            reader.onload = () => {
            imagePreview.value = reader.result;
            };
            reader.readAsDataURL(file);
        }
    };

    onMounted(async () => {
        await verifyPayment();
        await FetchSite();
    });
</script>



<template>
    <AppLayout>
        <!-- Inserire intestazione pagina -->
        <form @submit.prevent="submit" class="my-5 mx-5">
            <div class="row">

                <div class="form-group col-md-7">
                    <label for="inputName">Nome</label>
                    <input type="text" v-model="name" class="form-control" id="inputName" placeholder="Inserisci il nome" required>
                </div>

                <div class="form-group col-md-4">
                    <label for="inputPrice">Prezzo</label>
                    <input type="number" v-model="price" class="form-control" id="inputPrice" step="0.01" placeholder="Inserisci il prezzo" required>
                </div>

            </div>

            <div class="form-group col-md-11">
                <label for="inputIngredients">Ingredienti </label>
                <textarea v-model="ingredients" class="form-control" rows="4" cols="50" id="inputIngredients" placeholder="Lista degli ingredienti..."  required/>
            </div>

            <div class="form-group col-md-11">
                <label for="inputAllergens">Allergeni</label>
                <textarea v-model="allergens" class="form-control" rows="4" cols="50" id="inputAllergens" placeholder="Lista degli allergeni..." required/>
            </div>

            <div class="form-group col-md-11">
                <label for="inputCategory">Categoria</label>
                <select id="inputCategory" v-model="category" class="form-control" required>
                    <option>Bevande</option>
                    <option>Dessert</option>
                    <option>Pizze classice</option>
                    <option>Pizze bianche</option>
                    <option>Pizze rosse</option>
                    <option>Primi</option>
                    <option>Secondi</option>
                    <option>Primi di pesce</option>
                    <option>Secondi di pesce</option>
                    <option>Contorni</option>
                </select>
            </div>
            
            <div class="form-group col-md-2">
                <label for="inputImage">Immagine</label>
                <input type="file" accept="image/*" @change="handleFile" required/>
                <!-- Anteprima dell'immagine -->
                <div v-if="imagePreview">
                    <img :src="imagePreview" alt="Anteprima Immagine" />
                </div>
            </div>

            <button type="submit" class="btn btn-primary mt-5">Registra elemento</button>
        </form>
    </AppLayout>
</template>