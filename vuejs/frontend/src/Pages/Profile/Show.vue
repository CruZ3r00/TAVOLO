<script setup>
import { ref } from 'vue';
import DeleteUserForm from '@/Pages/Profile/Partials/DeleteUserForm.vue';
import SectionBorder from '@/components/SectionBorder.vue';
import TwoFactorAuthenticationForm from '@/Pages/Profile/Partials/TwoFactorAuthenticationForm.vue';
import UpdatePasswordForm from '@/Pages/Profile/Partials/UpdatePasswordForm.vue';
import UpdateProfileInformationForm from '@/Pages/Profile/Partials/UpdateProfileInformationForm.vue';
import AppLayout from '@/Layouts/AppLayout.vue';
import { useStore } from 'vuex';
const store = useStore();

const Hprofile = ref(true);
const Hpsw = ref(false);
const H2fact = ref(false);
const Hdelete = ref(false);


defineProps({
    confirmsTwoFactorAuthentication: Boolean,
    sessions: Array,
});
const userinfo = ref('');
const x = store.getters.getUser;
userinfo.value = {
    'id': x.id,
    'username' :  x.username,
    'email' : x.email,
}

</script>

<template>
    <AppLayout class="d-flex flex-column min-vh-100">
        
        <div class="container-fluid flex-grow-1">
            
            <div class="row vh-100">
                <!-- Barra Laterale sempre visibile su schermi grandi -->
                <nav class="col-lg-2 bg-dark text-white d-none d-lg-flex flex-column p-3" style="height:100%;">
                    <h4 class="text-center">Menu</h4>
                    <ul class="nav flex-column">
                        <li class="nav-item"><a class="nav-link text-white" @click="handler('profilo')" value="profile">Profilo</a></li>
                        <li class="nav-item"><a class="nav-link text-white" @click="handler('cambiopsw')">Cambio password</a></li>
                        <li class="nav-item"><a class="nav-link text-white" @click="handler('duefattori')">Autenticazione a due fattori</a></li>
                        <li class="nav-item"><a class="nav-link text-white" @click="handler('delete')">Elimina account</a></li>
                    </ul>
                </nav>
                <main class="col-lg-10 col-12 p-4d-flex flex-column flex-grow-1">
                    <nav class="navbar navbar-expand-lg navbar-dark bg-dark d-lg-none">
                        <div class="container-fluid">
                            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                                <span class="navbar-toggler-icon"></span>
                            </button>
                            <div class="collapse navbar-collapse" id="navbarNav">
                                <ul class="navbar-nav">
                                    <li class="nav-item"><a class="nav-link" href="#">Home</a></li>
                                    <li class="nav-item"><a class="nav-link" href="#">Servizi</a></li>
                                    <li class="nav-item"><a class="nav-link" href="#">Menu</a></li>
                                    <li class="nav-item"><a class="nav-link" href="#">Contatti</a></li>
                                </ul>
                            </div>
                        </div>
                    </nav>
                    <div class="bg-white d-flex justify-content-center align-items-center">
                        <div class="bg-white p-4 w-100">
                            <UpdateProfileInformationForm v-if="Hprofile" :user="userinfo" />
                            <SectionBorder />

                            <UpdatePasswordForm v-if="Hpsw" :id="userinfo.id"/>
                            <SectionBorder />
                        
                            <TwoFactorAuthenticationForm v-if="H2fact" :requires-confirmation="confirmsTwoFactorAuthentication"/>
                            <SectionBorder />


                            <template>
                                <SectionBorder />

                                <DeleteUserForm />
                            </template>
                        </div>
                    </div>
                </main>
            </div>

        </div>
        
    </AppLayout>
</template>
