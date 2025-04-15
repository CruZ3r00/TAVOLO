<script setup> //Paginas che gestisce le componenti e la loro visualizzazione del profilo dell'utente
    import { ref } from 'vue';
    import DeleteUserForm from '@/Pages/Profile/Partials/DeleteUserForm.vue';
    import SectionBorder from '@/components/SectionBorder.vue';
    import TwoFactorAuthenticationForm from '@/Pages/Profile/Partials/TwoFactorAuthenticationForm.vue';
    import UpdatePasswordForm from '@/Pages/Profile/Partials/UpdatePasswordForm.vue';
    import UpdateProfileInformationForm from '@/Pages/Profile/Partials/UpdateProfileInformationForm.vue';
    import GeneratorQRCode from '@/components/GeneratorQRCode.vue';
    import AppLayout from '@/Layouts/AppLayout.vue';
    import { useStore } from 'vuex';
    import { nextTick, onMounted } from 'vue'; 
    //per recuperare le info dell'utente loggato
    const store = useStore();

    //per decidere quale form visualizzare
    const Hprofile = ref(true);
    const Hpsw = ref(false);
    const H2fact = ref(false);
    const Hdelete = ref(false);
    const Hqr = ref(false);

    defineProps({
        confirmsTwoFactorAuthentication: Boolean,
        sessions: Array,
    });

    const userinfo = ref('');
    const x = store.getters.getUser;
    userinfo.value = {
        'id': x.documentId,
        'username' :  x.username,
        'email' : x.email,
    }

    const handler = (x) => {
        
        switch (x){
            case 'profilo':
                Hprofile.value = true;
                Hpsw.value = false;
                H2fact.value = false;
                Hqr.value = false;
                Hdelete.value = false;
            break;
            case 'cambiopsw':
                Hprofile.value = false;
                Hpsw.value = true;
                H2fact.value = false;
                Hqr.value = false;
                Hdelete.value = false;
            break;
            case 'duefattori':
                Hprofile.value = false;
                Hpsw.value = false;
                H2fact.value = true;
                Hqr.value = false;
                Hdelete.value = false;
            break;
            case 'qr':
                Hprofile.value = false;
                Hpsw.value = false;
                H2fact.value = false;
                Hqr.value = true;
                Hdelete.value = false;
            break;
            case 'delete':
                Hprofile.value = false;
                Hpsw.value = false;
                H2fact.value = false;
                Hqr.value = false;
                Hdelete.value = true;
            break;
        }
    }

    // Imposta il titolo della pagina
    onMounted(async () => {
        nextTick(() => {
            document.title = 'Pagina del profilo';
        });
    });

</script>

<template>
    <AppLayout>
        
        <div class="container-fluid flex-grow-1">
            
            <div class="row vh-100">
                <!-- Barra Laterale sempre visibile su schermi grandi -->
                <nav class="col-lg-2 bg-dark text-white d-none d-lg-flex flex-column p-3" style="height:100%;">
                    <h4 class="text-center">Menu</h4>
                    <ul class="nav flex-column">
                        <li class="nav-item"><button class="nav-link text-white" @click="handler('profilo')">Profilo</button></li>
                        <li class="nav-item"><button class="nav-link text-white" @click="handler('cambiopsw')">Cambio password</button></li>
                        <li class="nav-item"><button class="nav-link text-white" @click="handler('duefattori')">Autenticazione a due fattori</button></li>
                        <li class="nav-item"><button class="nav-link text-white" @click="handler('qr')">Genera QR code</button></li>
                        <li class="nav-item"><button class="nav-link text-white" @click="handler('delete')">Elimina account</button></li>
                    </ul>
                </nav>
                <main class="col-lg-10 col-12 p-4d-flex flex-column flex-grow-1">
                    <!-- navbar da sistemare per far si che appaia solo il tasto che fa comparire il menu come offcanvas -->
                    <nav class="navbar navbar-expand-lg navbar-dark bg-dark d-lg-none">
                        <div class="container-fluid">
                            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                                <span class="navbar-toggler-icon"></span>
                            </button>
                            <div class="collapse navbar-collapse" id="navbarNav">
                                <ul class="navbar-nav">
                                    <li class="nav-item"><button class="nav-link text-white" @click="handler('profilo')">Profilo</button></li>
                                    <li class="nav-item"><button class="nav-link text-white" @click="handler('cambiopsw')">Cambio password</button></li>
                                    <li class="nav-item"><button class="nav-link text-white" @click="handler('duefattori')">Autenticazione a due fattori</button></li>
                                    <li class="nav-item"><button class="nav-link text-white" @click="handler('qr')">Genera QR code</button></li>
                                    <li class="nav-item"><button class="nav-link text-white" @click="handler('delete')">Elimina account</button></li>
                                </ul>
                            </div>
                        </div>
                    </nav>
                    <div class="bg-white d-flex justify-content-center align-items-center">
                        <!-- visualizzati singolarmente nella pagina per non creare confusione
                            forms per la modifica di varie info e sicurezza dell'utente -->

                        <div class="bg-white p-4 w-100">
                            <UpdateProfileInformationForm v-if="Hprofile" :user="userinfo" />
                            <SectionBorder />

                            <UpdatePasswordForm v-if="Hpsw" :id="userinfo.id"/>
                            <SectionBorder />

                            <GeneratorQRCode v-if="Hqr" />
                            <SectionBorder />

                            <TwoFactorAuthenticationForm v-if="H2fact" :requires-confirmation="confirmsTwoFactorAuthentication"/>
                            <SectionBorder />

                            <DeleteUserForm v-if="Hdelete"/>
                        </div>
                    </div>
                </main>
            </div>

        </div>
        
    </AppLayout>
</template>
